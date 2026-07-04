import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { initDB, dbOperations } from "./server-db";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { Ticket, TicketComment } from "./src/types";

dotenv.config();

// Initialize the local JSON database
initDB();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Initialize Google Gemini SDK (if API key is available)
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
  console.log("Gemini API Client initialized successfully.");
} else {
  console.warn("GEMINI_API_KEY is missing. AI features will fallback to deterministic rules.");
}

// ----------------------------------------------------
// AUTHENTICATION APIs
// ----------------------------------------------------
// Simple session state
const activeSessions = new Map<string, any>();

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  const users = dbOperations.getUsers();
  const foundUser = users.find(u => u.username === username && u.password === password);

  if (foundUser) {
    const token = "token_" + Math.random().toString(36).substring(2) + "_" + foundUser.id;
    const sessionData = {
      id: foundUser.id,
      username: foundUser.username,
      name: foundUser.name,
      email: foundUser.email,
      role: foundUser.role,
      departmentId: foundUser.departmentId,
      avatar: foundUser.avatar
    };
    activeSessions.set(token, sessionData);
    return res.json({ token, user: sessionData });
  }

  return res.status(401).json({ error: "Invalid username or password" });
});

app.post("/api/auth/logout", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) {
    activeSessions.delete(token);
  }
  return res.json({ success: true });
});

app.get("/api/auth/me", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const session = token ? activeSessions.get(token) : null;
  if (session) {
    return res.json({ user: session });
  }
  return res.status(401).json({ error: "Unauthorized" });
});

// Middleware to check session
const requireAuth = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const session = token ? activeSessions.get(token) : null;
  if (!session) {
    return res.status(401).json({ error: "Unauthorized access" });
  }
  req.user = session;
  next();
};

// ----------------------------------------------------
// TICKET LIFECYCLE APIs
// ----------------------------------------------------

// List and search tickets
app.get("/api/tickets", requireAuth, (req: any, res) => {
  let tickets = dbOperations.getTickets();
  const { search, department, category, priority, status } = req.query;

  // Filter based on user role (agents see their department's tickets or assigned tickets, admins see all)
  if (req.user.role === 'agent') {
    const agentDept = req.user.departmentId;
    tickets = tickets.filter(t => t.departmentId === agentDept || t.assignedAgentId === req.user.id || !t.departmentId);
  }

  // Apply Search
  if (search) {
    const q = (search as string).toLowerCase();
    tickets = tickets.filter(t => 
      t.id.toLowerCase().includes(q) ||
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.customerName.toLowerCase().includes(q) ||
      t.customerEmail.toLowerCase().includes(q)
    );
  }

  // Apply filters
  if (department) {
    tickets = tickets.filter(t => t.departmentId === department);
  }
  if (category) {
    tickets = tickets.filter(t => t.categoryId === category);
  }
  if (priority) {
    tickets = tickets.filter(t => t.priority === priority);
  }
  if (status) {
    tickets = tickets.filter(t => t.status === status);
  }

  return res.json(tickets);
});

// Get single ticket details
app.get("/api/tickets/:id", requireAuth, (req, res) => {
  const ticket = dbOperations.getTicketById(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  return res.json(ticket);
});

// Create Ticket (AI-Assisted Classification inside)
app.post("/api/tickets", async (req: any, res) => {
  const { title, description, customerName, customerEmail, attachmentBase64, attachmentName } = req.body;

  if (!title || !description || !customerName || !customerEmail) {
    return res.status(400).json({ error: "Required fields missing" });
  }

  // Smart Priority Detection (Keyword Rules)
  const lowerText = (title + " " + description).toLowerCase();
  const priorityTriggers = ["urgent", "server down", "system crash", "payment failed", "security breach"];
  const hasTrigger = priorityTriggers.some(word => lowerText.includes(word));

  let finalPriority: any = hasTrigger ? "critical" : "medium";
  let finalCategory = "other";
  let finalDepartment = "customer_service";
  let sentiment: 'positive' | 'neutral' | 'negative' = "neutral";
  let sentimentScore = 0.5;
  let confidenceScore = 0.7;
  let aiReason = "Standard routing using rule-based fallback.";
  let suggestedReply = "Thank you for submitting your ticket. A support representative will be in touch shortly.";

  // Call Gemini API if active
  if (ai) {
    try {
      const classifyTemplate = dbOperations.getPrompts().find(p => p.id === 'classify')?.template || "";
      const promptText = classifyTemplate
        .replace("{title}", title)
        .replace("{description}", description);

      const aiResponse = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: promptText,
        config: {
          responseMimeType: "application/json"
        }
      });

      const parsed = JSON.parse(aiResponse.text?.trim() || "{}");
      if (parsed) {
        if (parsed.category) {
          // Map to known categories
          const cats = dbOperations.getCategories();
          const matchedCat = cats.find(c => c.name.toLowerCase() === parsed.category.toLowerCase() || c.id === parsed.category.toLowerCase());
          if (matchedCat) finalCategory = matchedCat.id;
        }
        if (parsed.department) {
          const depts = dbOperations.getDepartments();
          const matchedDept = depts.find(d => d.name.toLowerCase() === parsed.department.toLowerCase() || d.id === parsed.department.toLowerCase().replace(/\s+/g, '_'));
          if (matchedDept) finalDepartment = matchedDept.id;
        }
        if (!hasTrigger && parsed.priority) {
          const p = parsed.priority.toLowerCase();
          if (["low", "medium", "high", "critical"].includes(p)) {
            finalPriority = p;
          }
        }
        if (parsed.sentiment) {
          const s = parsed.sentiment.toLowerCase();
          if (["positive", "neutral", "negative"].includes(s)) {
            sentiment = s as any;
          }
        }
        if (parsed.confidence !== undefined) {
          sentimentScore = parsed.confidence;
          confidenceScore = parsed.confidence;
        }
        if (parsed.reason) {
          aiReason = parsed.reason;
        }

        // Generate Suggested Reply using reply prompt
        const replyTemplate = dbOperations.getPrompts().find(p => p.id === 'reply')?.template || "";
        const replyPromptText = replyTemplate
          .replace("{customerName}", customerName)
          .replace("{title}", title)
          .replace("{description}", description)
          .replace("{category}", finalCategory)
          .replace("{department}", finalDepartment)
          .replace("{priority}", finalPriority);

        const replyResponse = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: replyPromptText
        });
        suggestedReply = replyResponse.text || suggestedReply;
      }
    } catch (err) {
      console.error("Gemini AI API classification failed, relying on keyword backups:", err);
      aiReason = "Backup keyword detection routed this ticket due to a transient AI error.";
    }
  } else {
    // Basic fallback deterministic rule routing
    if (lowerText.includes("billing") || lowerText.includes("invoice") || lowerText.includes("refund") || lowerText.includes("payment")) {
      finalCategory = "billing";
      finalDepartment = "finance";
    } else if (lowerText.includes("password") || lowerText.includes("login") || lowerText.includes("sign in")) {
      finalCategory = "password_reset";
      finalDepartment = "customer_service";
    } else if (lowerText.includes("wifi") || lowerText.includes("network") || lowerText.includes("internet") || lowerText.includes("router")) {
      finalCategory = "network_problems";
      finalDepartment = "network_team";
    } else if (lowerText.includes("sales") || lowerText.includes("pricing") || lowerText.includes("quote")) {
      finalCategory = "sales";
      finalDepartment = "sales_team";
    } else {
      finalCategory = "tech_support";
      finalDepartment = "it_support";
    }
  }

  // Format new Ticket
  const ticketId = "TKT-" + Math.floor(1000 + Math.random() * 9000);
  const newTicket: Ticket = {
    id: ticketId,
    title,
    description,
    customerName,
    customerEmail,
    categoryId: finalCategory,
    departmentId: finalDepartment,
    priority: finalPriority,
    status: "open",
    sentiment,
    sentimentScore,
    confidenceScore,
    aiReason,
    suggestedReply,
    assignedAgentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attachmentUrl: attachmentBase64 ? attachmentBase64 : undefined,
    attachmentName: attachmentName ? attachmentName : undefined
  };

  dbOperations.addTicket(newTicket);

  // Add system log comments & history
  dbOperations.addHistoryEntry({
    id: "h_" + Math.random().toString(36).substring(2),
    ticketId,
    userId: "system",
    userName: "AI Agent",
    action: "AI Auto-Classification",
    details: `Assigned: Category=${finalCategory}, Dept=${finalDepartment}, Priority=${finalPriority}, Sentiment=${sentiment}. Reason: ${aiReason}`,
    createdAt: new Date().toISOString()
  });

  dbOperations.addComment({
    id: "c_" + Math.random().toString(36).substring(2),
    ticketId,
    userId: "system",
    userName: "AI Agent",
    userRole: "ai",
    commentText: `**AI Auto-Route:** Classified in **${finalCategory}** & routed to **${finalDepartment}** department with **${finalPriority}** priority.\n\n*Confidence Score: ${(confidenceScore * 100).toFixed(0)}%*\n*Customer Sentiment: ${sentiment.toUpperCase()}*\n\n**Reasoning:** ${aiReason}`,
    createdAt: new Date().toISOString()
  });

  return res.json(newTicket);
});

// Update Ticket (e.g. Change department, status, assign, or add solution)
app.patch("/api/tickets/:id", requireAuth, (req: any, res) => {
  const ticketId = req.params.id;
  const existingTicket = dbOperations.getTicketById(ticketId);
  if (!existingTicket) return res.status(404).json({ error: "Ticket not found" });

  const { status, departmentId, priority, assignedAgentId, categoryId } = req.body;
  const updates: Partial<Ticket> = {};
  const changeDetails: string[] = [];

  if (status && status !== existingTicket.status) {
    updates.status = status;
    changeDetails.push(`Status changed from '${existingTicket.status}' to '${status}'`);
  }
  if (departmentId !== undefined && departmentId !== existingTicket.departmentId) {
    updates.departmentId = departmentId;
    changeDetails.push(`Department changed to '${departmentId || "Unassigned"}'`);
  }
  if (priority && priority !== existingTicket.priority) {
    updates.priority = priority;
    changeDetails.push(`Priority changed from '${existingTicket.priority}' to '${priority}'`);
  }
  if (assignedAgentId !== undefined && assignedAgentId !== existingTicket.assignedAgentId) {
    updates.assignedAgentId = assignedAgentId;
    const agentName = dbOperations.getUsers().find(u => u.id === assignedAgentId)?.name || "Unassigned";
    changeDetails.push(`Assigned agent set to ${agentName}`);
  }
  if (categoryId && categoryId !== existingTicket.categoryId) {
    updates.categoryId = categoryId;
    changeDetails.push(`Category changed to '${categoryId}'`);
  }

  if (changeDetails.length > 0) {
    const updated = dbOperations.updateTicket(ticketId, updates);
    
    // Save history
    dbOperations.addHistoryEntry({
      id: "h_" + Math.random().toString(36).substring(2),
      ticketId,
      userId: req.user.id,
      userName: req.user.name,
      action: "Ticket Update",
      details: changeDetails.join(", "),
      createdAt: new Date().toISOString()
    });

    return res.json(updated);
  }

  return res.json(existingTicket);
});

// Delete ticket
app.delete("/api/tickets/:id", requireAuth, (req, res) => {
  dbOperations.deleteTicket(req.params.id);
  return res.json({ success: true });
});

// ----------------------------------------------------
// COMMENTS & DISCUSSION APIs
// ----------------------------------------------------
app.get("/api/tickets/:id/comments", requireAuth, (req, res) => {
  const comments = dbOperations.getCommentsForTicket(req.params.id);
  return res.json(comments);
});

app.post("/api/tickets/:id/comments", requireAuth, (req: any, res) => {
  const { commentText, isAiGenerated } = req.body;
  const ticketId = req.params.id;

  if (!commentText) return res.status(400).json({ error: "Comment text empty" });

  const newComment: TicketComment = {
    id: "c_" + Math.random().toString(36).substring(2),
    ticketId,
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    commentText,
    isAiGenerated: !!isAiGenerated,
    createdAt: new Date().toISOString()
  };

  dbOperations.addComment(newComment);

  // Add history log
  dbOperations.addHistoryEntry({
    id: "h_" + Math.random().toString(36).substring(2),
    ticketId,
    userId: req.user.id,
    userName: req.user.name,
    action: "Comment Added",
    details: `${req.user.name} posted a new reply.`,
    createdAt: new Date().toISOString()
  });

  return res.json(newComment);
});

app.get("/api/tickets/:id/history", requireAuth, (req, res) => {
  const history = dbOperations.getHistoryForTicket(req.params.id);
  return res.json(history);
});

// ----------------------------------------------------
// SIMILAR TICKET FINDER API
// ----------------------------------------------------
app.get("/api/tickets/:id/similar", requireAuth, (req, res) => {
  const ticket = dbOperations.getTicketById(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });

  const currentWords = new Set((ticket.title + " " + ticket.description).toLowerCase().match(/\w+/g) || []);
  const otherTickets = dbOperations.getTickets().filter(t => t.id !== ticket.id);

  const similarities = otherTickets.map(other => {
    const otherWords = new Set((other.title + " " + other.description).toLowerCase().match(/\w+/g) || []);
    const intersection = new Set([...currentWords].filter(w => otherWords.has(w)));
    const union = new Set([...currentWords, ...otherWords]);
    const score = union.size > 0 ? intersection.size / union.size : 0;
    return { ticket: other, score };
  });

  const matched = similarities
    .filter(item => item.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return res.json(matched);
});

// ----------------------------------------------------
// ANALYTICS & DASHBOARD APIs
// ----------------------------------------------------
app.get("/api/analytics/dashboard", requireAuth, (req, res) => {
  const tickets = dbOperations.getTickets();
  const departments = dbOperations.getDepartments();

  const total = tickets.length;
  const open = tickets.filter(t => t.status === 'open').length;
  const resolved = tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;
  const inProgress = tickets.filter(t => t.status === 'in_progress').length;
  const critical = tickets.filter(t => t.priority === 'critical' && t.status !== 'closed').length;

  // Department-wise count
  const departmentCounts = departments.map(d => {
    const count = tickets.filter(t => t.departmentId === d.id).length;
    return {
      departmentId: d.id,
      departmentName: d.name,
      count
    };
  });

  // Calculate generic daily ticket trend (last 7 days)
  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    return dateStr;
  }).reverse();

  const dailyCounts = last7Days.map(dateStr => {
    const count = tickets.filter(t => t.createdAt.startsWith(dateStr)).length;
    return { date: dateStr, count };
  });

  // Average resolution time simulation
  const avgResolutionTimeHours = 4.2;

  return res.json({
    totalTickets: total,
    openTickets: open + inProgress,
    closedTickets: resolved,
    criticalTickets: critical,
    avgResolutionTimeHours,
    departmentCounts,
    dailyCounts
  });
});

// Generate analytical report
app.get("/api/analytics/reports", requireAuth, (req, res) => {
  const { type } = req.query; // daily, weekly, monthly
  const tickets = dbOperations.getTickets();
  const depts = dbOperations.getDepartments();
  const cats = dbOperations.getCategories();

  // Simple aggregation based on parameters
  const reportData = {
    generatedAt: new Date().toISOString(),
    reportType: type || "weekly",
    summary: {
      totalCreated: tickets.length,
      openPercentage: ((tickets.filter(t => t.status !== 'closed' && t.status !== 'resolved').length / Math.max(tickets.length, 1)) * 100).toFixed(0) + "%",
      urgentEscalated: tickets.filter(t => t.priority === 'critical').length
    },
    byDepartment: depts.map(d => ({
      name: d.name,
      total: tickets.filter(t => t.departmentId === d.id).length,
      resolved: tickets.filter(t => t.departmentId === d.id && (t.status === 'resolved' || t.status === 'closed')).length
    })),
    byCategory: cats.map(c => ({
      name: c.name,
      count: tickets.filter(t => t.categoryId === c.id).length
    }))
  };

  return res.json(reportData);
});

// ----------------------------------------------------
// ADMIN PANEL APIs
// ----------------------------------------------------
app.get("/api/admin/users", requireAuth, (req, res) => {
  return res.json(dbOperations.getUsers());
});

app.get("/api/admin/departments", requireAuth, (req, res) => {
  return res.json(dbOperations.getDepartments());
});

app.post("/api/admin/departments", requireAuth, (req, res) => {
  const { name, code, description } = req.body;
  if (!name || !code) return res.status(400).json({ error: "Name and Code required" });
  const id = name.toLowerCase().replace(/\s+/g, '_');
  const d = dbOperations.addDepartment({ id, name, code, description: description || "" });
  return res.json(d);
});

app.get("/api/admin/categories", requireAuth, (req, res) => {
  return res.json(dbOperations.getCategories());
});

app.post("/api/admin/categories", requireAuth, (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  const id = name.toLowerCase().replace(/\s+/g, '_');
  const c = dbOperations.addCategory({ id, name, description: description || "" });
  return res.json(c);
});

app.get("/api/admin/prompts", requireAuth, (req, res) => {
  return res.json(dbOperations.getPrompts());
});

app.put("/api/admin/prompts/:id", requireAuth, (req, res) => {
  const { template } = req.body;
  if (!template) return res.status(400).json({ error: "Template body required" });
  const updated = dbOperations.updatePrompt(req.params.id, template);
  if (!updated) return res.status(404).json({ error: "Template not found" });
  return res.json(updated);
});

// ----------------------------------------------------
// BONUS FEATURE: AI CHATBOT / CO-PILOT CREATION API
// ----------------------------------------------------
app.post("/api/ai/chatbot", async (req, res) => {
  const { messages, userContext } = req.body;

  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: "No messages sent" });
  }

  if (!ai) {
    return res.json({
      reply: "AI Chatbot is currently offline (Missing Gemini API Key), please use the manual Ticket form.",
      ticketForm: null
    });
  }

  try {
    const promptContext = `You are a helpful customer support AI Assistant.
The user is talking to you to report an issue. Your goal is to guide them and extract the following:
1. Short Title summarizing their problem
2. Clear Description of the issue
3. Customer Name
4. Customer Email

Current User Context/Form State (if already known):
${JSON.stringify(userContext || {})}

Analyze the conversation history. If you have enough information to construct a valid support ticket, respond with the ticket details in JSON inside a special block starting with "---TICKET_READY---" followed by a JSON representation of:
{
  "title": "Extracted Title",
  "description": "Full extracted description",
  "customerName": "Customer's name",
  "customerEmail": "Customer's email address"
}
Otherwise, ask the user polite questions to collect missing items or clarify the issue. Always maintain a warm, reassuring support persona.`;

    const chatMessages = messages.map((m: any) => ({
      role: m.sender === 'user' ? 'user' as const : 'model' as const,
      parts: [{ text: m.text }]
    }));

    // Add instructions as system prompt
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: chatMessages,
      config: {
        systemInstruction: promptContext
      }
    });

    const aiText = response.text || "";
    let extractedForm: any = null;

    if (aiText.includes("---TICKET_READY---")) {
      const parts = aiText.split("---TICKET_READY---");
      const cleanMsg = parts[0].trim();
      const jsonStr = parts[1].trim();
      try {
        extractedForm = JSON.parse(jsonStr);
      } catch (e) {
        console.error("Failed to parse extracted JSON from chatbot", e);
      }
      return res.json({
        reply: cleanMsg || "I have collected your ticket details! Please verify and submit the form below.",
        ticketForm: extractedForm
      });
    }

    return res.json({
      reply: aiText,
      ticketForm: null
    });

  } catch (err) {
    console.error("Chatbot generation error", err);
    return res.status(500).json({ error: "Chatbot service is temporarily unavailable." });
  }
});


// ----------------------------------------------------
// VITE DEV SERVER OR STATIC SERVING MIDDLEWARE
// ----------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite dev middleware mounted.");
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log("Serving static production assets from dist/.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AI-Powered Ticket Routing Agent server running on http://localhost:${PORT}`);
  });
}

startServer();
