import fs from 'fs';
import path from 'path';
import { User, Department, Category, Ticket, TicketHistory, TicketComment, PromptTemplate } from './src/types';

const DB_FILE_PATH = path.join(process.cwd(), 'data', 'db.json');

// Initial seed data
const initialDepartments: Department[] = [
  { id: 'it_support', name: 'IT Support', code: 'IT', description: 'Handles software installations, hardware problems, and generic IT tickets.' },
  { id: 'finance', name: 'Finance', code: 'FIN', description: 'Handles billing, invoices, refunds, and subscriptions.' },
  { id: 'sales_team', name: 'Sales Team', code: 'SLS', description: 'Handles product inquiries, pricing quotes, and onboarding new clients.' },
  { id: 'hr', name: 'HR', code: 'HR', description: 'Handles employee questions, internal applications, and workspace feedback.' },
  { id: 'customer_service', name: 'Customer Service', code: 'CS', description: 'General enquiries, password resets, and user account support.' },
  { id: 'network_team', name: 'Network Team', code: 'NET', description: 'Handles Wi-Fi routing, network switch faults, and server downtime.' }
];

const initialCategories: Category[] = [
  { id: 'tech_support', name: 'Technical Support', description: 'App bug report or operational technical difficulties' },
  { id: 'billing', name: 'Billing', description: 'Invoices, refunds, chargebacks, and payment processing' },
  { id: 'sales', name: 'Sales', description: 'New packages, enterprise sales, and promotional questions' },
  { id: 'account_issues', name: 'Account Issues', description: 'User profile issues, password resets, and permission changes' },
  { id: 'network_problems', name: 'Network Problems', description: 'Server offline, slow loading, and connection issues' },
  { id: 'hardware', name: 'Hardware', description: 'Workstation repair, monitors, and accessory replacement' },
  { id: 'software', name: 'Software', description: 'License keys, installation failures, and program crashes' },
  { id: 'password_reset', name: 'Password Reset', description: 'Forgotten credentials and unlock account requests' },
  { id: 'feedback', name: 'Feedback', description: 'User reviews, feature requests, and generic suggestions' },
  { id: 'other', name: 'Other', description: 'Any other issues not listed above' }
];

const initialUsers = [
  { id: 'u_admin', username: 'admin', password: 'password', name: 'Sarah Connor', email: 'sarah.connor@enterprise.com', role: 'admin' as const, departmentId: null, avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150' },
  { id: 'u_agent1', username: 'agent1', password: 'password', name: 'Marcus Wright', email: 'marcus.wright@enterprise.com', role: 'agent' as const, departmentId: 'it_support', avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150' },
  { id: 'u_agent2', username: 'agent2', password: 'password', name: 'Kyle Reese', email: 'kyle.reese@enterprise.com', role: 'agent' as const, departmentId: 'finance', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150' },
  { id: 'u_agent3', username: 'agent3', password: 'password', name: 'John Connor', email: 'john.connor@enterprise.com', role: 'agent' as const, departmentId: 'network_team', avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150' }
];

const initialTickets: Ticket[] = [
  {
    id: 'TKT-1001',
    title: 'URGENT: Main payment gateway system crash',
    description: 'We are receiving a high volume of complaints from customers that checkout is failing with a "payment gateway response timeout (500)". This is blocking all new sales. Please check the logs immediately!',
    customerName: 'Robert Langdon',
    customerEmail: 'rlangdon@harvard.edu',
    categoryId: 'billing',
    departmentId: 'finance',
    priority: 'critical',
    status: 'open',
    sentiment: 'negative',
    sentimentScore: 0.95,
    confidenceScore: 0.98,
    aiReason: 'Contains priority keywords "system crash" and "payment gateway" indicating high financial loss risk. Routing to Finance with Critical priority.',
    suggestedReply: 'Dear Robert,\n\nWe sincerely apologize for the checkout failure. Our engineering team is actively investigating the "payment gateway response timeout" on the main portal. We will provide updates every 15 minutes.\n\nBest regards,\nSupport Operations',
    assignedAgentId: 'u_agent2',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(), // 2 hours ago
    updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'TKT-1002',
    title: 'VPN connection dropping every 5 minutes',
    description: 'Ever since the upgrade yesterday, my corporate VPN client drops its connection. It makes remote working impossible because my database connections get killed.',
    customerName: 'Eleanor Vance',
    customerEmail: 'evance@hillhouse.org',
    categoryId: 'network_problems',
    departmentId: 'network_team',
    priority: 'high',
    status: 'in_progress',
    sentiment: 'negative',
    sentimentScore: 0.72,
    confidenceScore: 0.89,
    aiReason: 'Identified connection drops and VPN, routing to the Network Team. Set to High priority because remote work is completely blocked.',
    suggestedReply: 'Hi Eleanor,\n\nI understand how disruptive VPN disconnects can be. We are looking into the routing tables updated yesterday and will assist in finding a workaround or roll back the update shortly.\n\nBest regards,\nNetwork Team',
    assignedAgentId: 'u_agent3',
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(), // 12 hours ago
    updatedAt: new Date(Date.now() - 3600000 * 11).toISOString(),
  },
  {
    id: 'TKT-1003',
    title: 'Password reset link not arriving in email inbox',
    description: 'I clicked the password reset button multiple times but I am not receiving any recovery email. Can you please unlock my profile or manually send me a reset token?',
    customerName: 'Sherlock Holmes',
    customerEmail: 'detective@bakerstreet.com',
    categoryId: 'password_reset',
    departmentId: 'customer_service',
    priority: 'low',
    status: 'resolved',
    sentiment: 'neutral',
    sentimentScore: 0.45,
    confidenceScore: 0.92,
    aiReason: 'Categorized under Password Reset and routed to Customer Service as a Low/Medium priority standard operational request.',
    suggestedReply: 'Hello Sherlock,\n\nWe have manually generated a secure reset link for your account. Please click here to reset your credentials. Be sure to check your spam folder if future automated emails do not arrive.\n\nBest regards,\nCustomer Care',
    assignedAgentId: null,
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(), // 1 day ago
    updatedAt: new Date(Date.now() - 3600000 * 23).toISOString(),
  },
  {
    id: 'TKT-1004',
    title: 'Inquiry about enterprise volume license pricing',
    description: 'We are looking to onboard 450 users onto your SaaS software platform. Do you offer custom pricing models, or bulk discounts for long-term yearly contracts?',
    customerName: 'Bruce Wayne',
    customerEmail: 'bwayne@waynecorp.com',
    categoryId: 'sales',
    departmentId: 'sales_team',
    priority: 'medium',
    status: 'open',
    sentiment: 'positive',
    sentimentScore: 0.80,
    confidenceScore: 0.94,
    aiReason: 'Identified key commercial signals like "onboard 450 users" and "volume pricing". Routed to Sales Team.',
    suggestedReply: 'Dear Bruce,\n\nThank you for reaching out! We would be thrilled to support Wayne Enterprises. Yes, we provide custom enterprise pricing and tiered volume discounts for yearly subscriptions. A sales representative will email you in 1 hour with a formal proposal.\n\nWarm regards,\nSales Onboarding Team',
    assignedAgentId: null,
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(), // 4 hours ago
    updatedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
  }
];

const initialComments: TicketComment[] = [
  {
    id: 'c1',
    ticketId: 'TKT-1001',
    userId: 'system',
    userName: 'AI Agent',
    userRole: 'ai',
    commentText: 'Automated AI Routing: Detected "system crash" and "payment failed". Ticket elevated to CRITICAL priority and assigned to Finance department.',
    createdAt: new Date(Date.now() - 3600000 * 2 + 60000).toISOString(),
  },
  {
    id: 'c2',
    ticketId: 'TKT-1002',
    userId: 'u_agent3',
    userName: 'John Connor',
    userRole: 'agent',
    commentText: 'Investigating if the new IPSec policy in the router config is causing packet fragmentation over Comcast/Xfinity routes.',
    createdAt: new Date(Date.now() - 3600000 * 11).toISOString(),
  }
];

const initialHistory: TicketHistory[] = [
  {
    id: 'h1',
    ticketId: 'TKT-1001',
    userId: 'system',
    userName: 'AI Classifier',
    action: 'AI Auto-Classification',
    details: 'Routed to Finance. Priority: Critical. Sentiment: Negative.',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'h2',
    ticketId: 'TKT-1002',
    userId: 'system',
    userName: 'AI Classifier',
    action: 'AI Auto-Classification',
    details: 'Routed to Network Team. Priority: High. Sentiment: Negative.',
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
  }
];

const defaultPromptTemplates: PromptTemplate[] = [
  {
    id: 'classify',
    name: 'Ticket Classification Template',
    template: `You are an intelligent customer support ticket router and analyst.
Analyze the following ticket title and description, and output a valid JSON object matching the requested schema.

Ticket Title: "{title}"
Ticket Description: "{description}"

Rules for analysis:
1. Category must be one of: Technical Support, Billing, Sales, Account Issues, Network Problems, Hardware, Software, Password Reset, Feedback, Other.
2. Department must be one of: IT Support, Finance, Sales Team, HR, Customer Service, Network Team.
3. Priority must be one of: Low, Medium, High, Critical.
4. Smart Priority Rule: If the text includes extreme keywords such as "urgent", "server down", "system crash", "payment failed", "security breach", assign "Critical" priority.
5. Sentiment must be one of: positive, neutral, negative. Provide a confidence score between 0.0 and 1.0.

Your output must be strictly valid JSON without markdown wrapping. Output format:
{
  "category": "Technical Support",
  "department": "IT Support",
  "priority": "High",
  "sentiment": "negative",
  "confidence": 0.92,
  "reason": "Explain briefly in 1-2 sentences why this category/department was selected."
}`,
    description: 'System prompt used to extract metadata, assign correct business departments, analyze customer sentiment, and calculate routing confidence.'
  },
  {
    id: 'reply',
    name: 'Suggested Reply Draft Template',
    template: `You are a polite, highly professional customer support agent representing our enterprise tech company.
Draft a professional first-response reply to this customer ticket.

Customer Name: {customerName}
Ticket Title: "{title}"
Ticket Details: "{description}"
AI Classification: Category={category}, Department={department}, Priority={priority}

Tone requirements:
- Be empathetic, reassuring, and solution-focused.
- Do not make binding promises on resolution times unless standard boilerplate (e.g. "we are looking into it").
- Keep it concise, warm, and formatted cleanly.

Draft Response:`,
    description: 'System prompt used by the AI to draft a context-aware and personalized first response to the user.'
  }
];

// In-Memory Database State
let dbState = {
  departments: [...initialDepartments],
  categories: [...initialCategories],
  users: [...initialUsers],
  tickets: [...initialTickets],
  comments: [...initialComments],
  history: [...initialHistory],
  prompts: [...defaultPromptTemplates]
};

// Ensure database file is loaded/saved
export function initDB() {
  const dir = path.dirname(DB_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(DB_FILE_PATH)) {
    try {
      const fileData = fs.readFileSync(DB_FILE_PATH, 'utf8');
      const parsed = JSON.parse(fileData);
      dbState = {
        departments: parsed.departments || [...initialDepartments],
        categories: parsed.categories || [...initialCategories],
        users: parsed.users || [...initialUsers],
        tickets: parsed.tickets || [...initialTickets],
        comments: parsed.comments || [...initialComments],
        history: parsed.history || [...initialHistory],
        prompts: parsed.prompts || [...defaultPromptTemplates]
      };
      console.log('Database loaded successfully from file.');
    } catch (e) {
      console.error('Failed to parse db.json, resetting to default seed data.', e);
      saveDB();
    }
  } else {
    saveDB();
  }
}

export function saveDB() {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(dbState, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save to database file', e);
  }
}

// Queries & Operations
export const dbOperations = {
  // Users
  getUsers: () => dbState.users,
  addUser: (user: any) => {
    dbState.users.push(user);
    saveDB();
    return user;
  },
  deleteUser: (userId: string) => {
    dbState.users = dbState.users.filter(u => u.id !== userId);
    saveDB();
  },

  // Departments
  getDepartments: () => dbState.departments,
  addDepartment: (dept: Department) => {
    dbState.departments.push(dept);
    saveDB();
    return dept;
  },
  deleteDepartment: (id: string) => {
    dbState.departments = dbState.departments.filter(d => d.id !== id);
    saveDB();
  },

  // Categories
  getCategories: () => dbState.categories,
  addCategory: (cat: Category) => {
    dbState.categories.push(cat);
    saveDB();
    return cat;
  },
  deleteCategory: (id: string) => {
    dbState.categories = dbState.categories.filter(c => c.id !== id);
    saveDB();
  },

  // Tickets
  getTickets: () => dbState.tickets,
  getTicketById: (id: string) => dbState.tickets.find(t => t.id === id),
  addTicket: (ticket: Ticket) => {
    dbState.tickets.unshift(ticket); // Newest first
    saveDB();
    return ticket;
  },
  updateTicket: (ticketId: string, updates: Partial<Ticket>) => {
    const idx = dbState.tickets.findIndex(t => t.id === ticketId);
    if (idx !== -1) {
      dbState.tickets[idx] = { ...dbState.tickets[idx], ...updates, updatedAt: new Date().toISOString() };
      saveDB();
      return dbState.tickets[idx];
    }
    return null;
  },
  deleteTicket: (id: string) => {
    dbState.tickets = dbState.tickets.filter(t => t.id !== id);
    dbState.comments = dbState.comments.filter(c => c.ticketId !== id);
    dbState.history = dbState.history.filter(h => h.ticketId !== id);
    saveDB();
  },

  // Comments
  getCommentsForTicket: (ticketId: string) => dbState.comments.filter(c => c.ticketId === ticketId),
  addComment: (comment: TicketComment) => {
    dbState.comments.push(comment);
    saveDB();
    return comment;
  },

  // History
  getHistoryForTicket: (ticketId: string) => dbState.history.filter(h => h.ticketId === ticketId).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  addHistoryEntry: (entry: TicketHistory) => {
    dbState.history.push(entry);
    saveDB();
    return entry;
  },

  // Prompts
  getPrompts: () => dbState.prompts,
  updatePrompt: (id: string, newTemplate: string) => {
    const prompt = dbState.prompts.find(p => p.id === id);
    if (prompt) {
      prompt.template = newTemplate;
      saveDB();
      return prompt;
    }
    return null;
  }
};
