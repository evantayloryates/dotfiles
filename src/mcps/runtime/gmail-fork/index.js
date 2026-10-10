#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { gmail as gmailApi } from 'googleapis/build/src/apis/gmail/index.js';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import open from 'open';
import os from 'os';
import { createEmailMessage, createEmailWithNodemailer } from "./utl.js";
import { createLabel, updateLabel, deleteLabel, listLabels, getOrCreateLabel } from "./label-manager.js";
import { createFilter, listFilters, getFilter, deleteFilter, filterTemplates } from "./filter-manager.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Configuration paths
const CONFIG_DIR = path.join(os.homedir(), '.gmail-mcp');
function getRuntimePaths() {
    return {
        accountName: process.env.GMAIL_ACCOUNT_NAME || 'default',
        oauthPath: process.env.GMAIL_OAUTH_PATH || path.join(CONFIG_DIR, 'gcp-oauth.keys.json'),
        credentialsPath: process.env.GMAIL_CREDENTIALS_PATH || path.join(CONFIG_DIR, 'credentials.json'),
    };
}
// OAuth2 configuration
let oauth2Client;
/**
 * Recursively extract email body content from MIME message parts
 * Handles complex email structures with nested parts
 */
function extractEmailContent(messagePart) {
    // Initialize containers for different content types
    let textContent = '';
    let htmlContent = '';
    // If the part has a body with data, process it based on MIME type
    if (messagePart.body && messagePart.body.data) {
        const content = Buffer.from(messagePart.body.data, 'base64').toString('utf8');
        // Store content based on its MIME type
        if (messagePart.mimeType === 'text/plain') {
            textContent = content;
        }
        else if (messagePart.mimeType === 'text/html') {
            htmlContent = content;
        }
    }
    // If the part has nested parts, recursively process them
    if (messagePart.parts && messagePart.parts.length > 0) {
        for (const part of messagePart.parts) {
            const { text, html } = extractEmailContent(part);
            if (text)
                textContent += text;
            if (html)
                htmlContent += html;
        }
    }
    // Return both plain text and HTML content
    return { text: textContent, html: htmlContent };
}
async function loadCredentials() {
    try {
        const { oauthPath, credentialsPath } = getRuntimePaths();
        // Create config directory if it doesn't exist (only needed for default path)
        if (!process.env.GMAIL_CREDENTIALS_PATH && !fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }
        // Check for OAuth keys in current directory first, then in config directory
        const localOAuthPath = path.join(process.cwd(), 'gcp-oauth.keys.json');
        if (fs.existsSync(localOAuthPath)) {
            // If found in current directory, copy to config directory
            fs.copyFileSync(localOAuthPath, oauthPath);
            console.log('OAuth keys found in current directory, copied to global config.');
        }
        if (!fs.existsSync(oauthPath)) {
            console.error('Error: OAuth keys file not found. Please place gcp-oauth.keys.json in current directory or', CONFIG_DIR);
            process.exit(1);
        }
        const keysContent = JSON.parse(fs.readFileSync(oauthPath, 'utf8'));
        const keys = keysContent.installed || keysContent.web;
        if (!keys) {
            console.error('Error: Invalid OAuth keys file format. File should contain either "installed" or "web" credentials.');
            process.exit(1);
        }
        const callback = process.argv[2] === 'auth' && process.argv[3]
            ? process.argv[3]
            : "http://localhost:3000/oauth2callback";
        oauth2Client = new OAuth2Client(keys.client_id, keys.client_secret, callback);
        if (fs.existsSync(credentialsPath)) {
            const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
            oauth2Client.setCredentials(credentials);
        }
        // Persist refreshed tokens so accounts don't lose auth on restart
        oauth2Client.on('tokens', (tokens) => {
            try {
                let saved = {};
                if (fs.existsSync(credentialsPath)) {
                    saved = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
                }
                fs.writeFileSync(credentialsPath, JSON.stringify({ ...saved, ...tokens }));
            }
            catch (e) {
                console.error('Failed to save refreshed tokens:', e);
            }
        });
    }
    catch (error) {
        console.error('Error loading credentials:', error);
        process.exit(1);
    }
}
async function authenticate(credPath) {
    const { credentialsPath } = getRuntimePaths();
    const savePath = credPath || credentialsPath;
    const server = http.createServer();
    server.listen(3000);
    return new Promise((resolve, reject) => {
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: [
                'https://www.googleapis.com/auth/gmail.modify',
                'https://www.googleapis.com/auth/gmail.settings.basic'
            ],
        });
        console.log('Please visit this URL to authenticate:', authUrl);
        open(authUrl);
        server.on('request', async (req, res) => {
            if (!req.url?.startsWith('/oauth2callback'))
                return;
            const url = new URL(req.url, 'http://localhost:3000');
            const code = url.searchParams.get('code');
            if (!code) {
                res.writeHead(400);
                res.end('No code provided');
                reject(new Error('No code provided'));
                return;
            }
            try {
                const { tokens } = await oauth2Client.getToken(code);
                oauth2Client.setCredentials(tokens);
                fs.writeFileSync(savePath, JSON.stringify(tokens));
                res.writeHead(200);
                res.end('Authentication successful! You can close this window.');
                server.close();
                resolve();
            }
            catch (error) {
                res.writeHead(500);
                res.end('Authentication failed');
                reject(error);
            }
        });
    });
}
// Schema definitions
const SendEmailSchema = z.object({
    to: z.array(z.string()).describe("List of recipient email addresses"),
    subject: z.string().describe("Email subject"),
    body: z.string().describe("Email body content (used for text/plain or when htmlBody not provided)"),
    htmlBody: z.string().optional().describe("HTML version of the email body"),
    mimeType: z.enum(['text/plain', 'text/html', 'multipart/alternative']).optional().default('text/plain').describe("Email content type"),
    cc: z.array(z.string()).optional().describe("List of CC recipients"),
    bcc: z.array(z.string()).optional().describe("List of BCC recipients"),
    threadId: z.string().optional().describe("Thread ID to reply to"),
    inReplyTo: z.string().optional().describe("Message ID being replied to"),
    attachments: z.array(z.string()).optional().describe("List of file paths to attach to the email"),
});
const ReadEmailSchema = z.object({
    messageId: z.string().describe("ID of the email message to retrieve"),
});
const GetLabelInfoSchema = z.object({
    labelName: z.string().describe("Label name or ID (e.g. 'INBOX', 'UNREAD', 'SENT', or a custom label name)"),
});
const CountEmailsSchema = z.object({
    query: z.string().describe("Gmail search query (e.g. 'is:unread in:inbox after:2026/03/01 before:2026/03/28')"),
});
const SearchEmailsSchema = z.object({
    query: z.string().describe("Gmail search query (e.g., 'from:example@gmail.com')"),
    maxResults: z.number().optional().describe("Maximum number of results to return (1-500, default 10)"),
    pageToken: z.string().optional().describe("Page token from a previous search to get the next page of results"),
});
// Updated schema to include removeLabelIds
const ModifyEmailSchema = z.object({
    messageId: z.string().describe("ID of the email message to modify"),
    labelIds: z.array(z.string()).optional().describe("List of label IDs to apply"),
    addLabelIds: z.array(z.string()).optional().describe("List of label IDs to add to the message"),
    removeLabelIds: z.array(z.string()).optional().describe("List of label IDs to remove from the message"),
});
const DeleteEmailSchema = z.object({
    messageId: z.string().describe("ID of the email message to delete"),
});
// New schema for listing email labels
const ListEmailLabelsSchema = z.object({}).describe("Retrieves all available Gmail labels");
// Label management schemas
const CreateLabelSchema = z.object({
    name: z.string().describe("Name for the new label"),
    messageListVisibility: z.enum(['show', 'hide']).optional().describe("Whether to show or hide the label in the message list"),
    labelListVisibility: z.enum(['labelShow', 'labelShowIfUnread', 'labelHide']).optional().describe("Visibility of the label in the label list"),
}).describe("Creates a new Gmail label");
const UpdateLabelSchema = z.object({
    id: z.string().describe("ID of the label to update"),
    name: z.string().optional().describe("New name for the label"),
    messageListVisibility: z.enum(['show', 'hide']).optional().describe("Whether to show or hide the label in the message list"),
    labelListVisibility: z.enum(['labelShow', 'labelShowIfUnread', 'labelHide']).optional().describe("Visibility of the label in the label list"),
}).describe("Updates an existing Gmail label");
const DeleteLabelSchema = z.object({
    id: z.string().describe("ID of the label to delete"),
}).describe("Deletes a Gmail label");
const GetOrCreateLabelSchema = z.object({
    name: z.string().describe("Name of the label to get or create"),
    messageListVisibility: z.enum(['show', 'hide']).optional().describe("Whether to show or hide the label in the message list"),
    labelListVisibility: z.enum(['labelShow', 'labelShowIfUnread', 'labelHide']).optional().describe("Visibility of the label in the label list"),
}).describe("Gets an existing label by name or creates it if it doesn't exist");
// Schemas for batch operations
const BatchModifyEmailsSchema = z.object({
    messageIds: z.array(z.string()).describe("List of message IDs to modify"),
    addLabelIds: z.array(z.string()).optional().describe("List of label IDs to add to all messages"),
    removeLabelIds: z.array(z.string()).optional().describe("List of label IDs to remove from all messages"),
    batchSize: z.number().optional().default(50).describe("Number of messages to process in each batch (default: 50)"),
});
const BatchDeleteEmailsSchema = z.object({
    messageIds: z.array(z.string()).describe("List of message IDs to delete"),
    batchSize: z.number().optional().default(50).describe("Number of messages to process in each batch (default: 50)"),
});
// Filter management schemas
const CreateFilterSchema = z.object({
    criteria: z.object({
        from: z.string().optional().describe("Sender email address to match"),
        to: z.string().optional().describe("Recipient email address to match"),
        subject: z.string().optional().describe("Subject text to match"),
        query: z.string().optional().describe("Gmail search query (e.g., 'has:attachment')"),
        negatedQuery: z.string().optional().describe("Text that must NOT be present"),
        hasAttachment: z.boolean().optional().describe("Whether to match emails with attachments"),
        excludeChats: z.boolean().optional().describe("Whether to exclude chat messages"),
        size: z.number().optional().describe("Email size in bytes"),
        sizeComparison: z.enum(['unspecified', 'smaller', 'larger']).optional().describe("Size comparison operator")
    }).describe("Criteria for matching emails"),
    action: z.object({
        addLabelIds: z.array(z.string()).optional().describe("Label IDs to add to matching emails"),
        removeLabelIds: z.array(z.string()).optional().describe("Label IDs to remove from matching emails"),
        forward: z.string().optional().describe("Email address to forward matching emails to")
    }).describe("Actions to perform on matching emails")
}).describe("Creates a new Gmail filter");
const ListFiltersSchema = z.object({}).describe("Retrieves all Gmail filters");
const GetFilterSchema = z.object({
    filterId: z.string().describe("ID of the filter to retrieve")
}).describe("Gets details of a specific Gmail filter");
const DeleteFilterSchema = z.object({
    filterId: z.string().describe("ID of the filter to delete")
}).describe("Deletes a Gmail filter");
const CreateFilterFromTemplateSchema = z.object({
    template: z.enum(['fromSender', 'withSubject', 'withAttachments', 'largeEmails', 'containingText', 'mailingList']).describe("Pre-defined filter template to use"),
    parameters: z.object({
        senderEmail: z.string().optional().describe("Sender email (for fromSender template)"),
        subjectText: z.string().optional().describe("Subject text (for withSubject template)"),
        searchText: z.string().optional().describe("Text to search for (for containingText template)"),
        listIdentifier: z.string().optional().describe("Mailing list identifier (for mailingList template)"),
        sizeInBytes: z.number().optional().describe("Size threshold in bytes (for largeEmails template)"),
        labelIds: z.array(z.string()).optional().describe("Label IDs to apply"),
        archive: z.boolean().optional().describe("Whether to archive (skip inbox)"),
        markAsRead: z.boolean().optional().describe("Whether to mark as read"),
        markImportant: z.boolean().optional().describe("Whether to mark as important")
    }).describe("Template-specific parameters")
}).describe("Creates a filter using a pre-defined template");
const DownloadAttachmentSchema = z.object({
    messageId: z.string().describe("ID of the email message containing the attachment"),
    attachmentId: z.string().describe("ID of the attachment to download"),
    filename: z.string().optional().describe("Filename to save the attachment as (if not provided, uses original filename)"),
    savePath: z.string().optional().describe("Directory path to save the attachment (defaults to current directory)"),
});
// Main function
async function main() {
    // setup <account-name> [oauth-keys-path]
    // Authenticates an account and writes a ready-to-use start-mcp.sh
    if (process.argv[2] === 'setup') {
        const account = process.argv[3];
        const oauthSource = process.argv[4];
        if (!account) {
            console.error('Usage: npx gmail-mcp-multiauth setup <account-name> [path-to-gcp-oauth.keys.json]');
            console.error('Example: npx gmail-mcp-multiauth setup personal ~/Downloads/gcp-oauth.keys.json');
            process.exit(1);
        }
        const accountDir = path.join(os.homedir(), `.gmail-${account}`);
        const accountOauthPath = path.join(accountDir, 'gcp-oauth.keys.json');
        const accountCredPath = path.join(accountDir, 'credentials.json');
        fs.mkdirSync(accountDir, { recursive: true });
        if (oauthSource) {
            const resolvedSource = oauthSource.replace(/^~/, os.homedir());
            if (!fs.existsSync(resolvedSource)) {
                console.error(`Error: File not found: ${resolvedSource}`);
                console.error(`Download gcp-oauth.keys.json from Google Cloud Console first.`);
                console.error(`Or skip the path if keys already exist in ${accountDir}`);
                process.exit(1);
            }
            fs.copyFileSync(resolvedSource, accountOauthPath);
            console.log(`Copied OAuth keys to ${accountOauthPath}`);
        }
        else if (!fs.existsSync(accountOauthPath)) {
            console.error(`Error: No gcp-oauth.keys.json at ${accountOauthPath}`);
            console.error(`Provide a path: npx gmail-mcp-multiauth setup ${account} ~/Downloads/gcp-oauth.keys.json`);
            process.exit(1);
        }
        process.env.GMAIL_OAUTH_PATH = accountOauthPath;
        process.env.GMAIL_CREDENTIALS_PATH = accountCredPath;
        process.env.GMAIL_ACCOUNT_NAME = account;
        await loadCredentials();
        console.log(`\nOpening browser to authenticate: ${account}`);
        console.log('Sign in with the correct Google account.\n');
        await authenticate(accountCredPath);
        // Auto-update MCP config files
        const mcpEntry = {
            type: 'stdio',
            command: 'npx',
            args: ['-y', 'gmail-mcp-multiauth'],
            env: {
                GMAIL_OAUTH_PATH: accountOauthPath,
                GMAIL_CREDENTIALS_PATH: accountCredPath,
                GMAIL_ACCOUNT_NAME: account
            }
        };
        const configPaths = [
            path.join(os.homedir(), '.cursor', 'mcp.json'),
            path.join(os.homedir(), '.claude.json'),
            path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
        ];
        let updated = [];
        for (const configPath of configPaths) {
            try {
                if (!fs.existsSync(configPath))
                    continue;
                const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                const key = `gmail-${account}`;
                const isClaudeConfig = configPath.endsWith('.claude.json') ||
                    configPath.endsWith('claude_desktop_config.json');
                // Claude config files must always use nested `mcpServers`.
                // Cursor's mcp.json may be either nested or root-level map.
                if (isClaudeConfig || Object.prototype.hasOwnProperty.call(raw, 'mcpServers')) {
                    const currentServers = raw.mcpServers && typeof raw.mcpServers === 'object'
                        ? raw.mcpServers
                        : {};
                    currentServers[key] = mcpEntry;
                    raw.mcpServers = currentServers;
                }
                else {
                    raw[key] = mcpEntry;
                }
                fs.writeFileSync(configPath, JSON.stringify(raw, null, 2));
                updated.push(configPath);
            }
            catch (e) {
                // skip files we can't parse
            }
        }
        console.log(`\nDone! gmail-${account} is ready.`);
        if (updated.length > 0) {
            console.log(`\nAuto-updated MCP configs:`);
            updated.forEach(p => console.log(`  ✓ ${p}`));
            console.log(`\nRestart Cursor / Claude Desktop to connect.`);
        }
        else {
            console.log(`\nNo MCP config files found. Add this manually:\n`);
            console.log(JSON.stringify({ [`gmail-${account}`]: mcpEntry }, null, 2));
        }
        process.exit(0);
    }
    await loadCredentials();
    if (process.argv[2] === 'auth') {
        await authenticate();
        console.log('Authentication completed successfully');
        process.exit(0);
    }
    // Initialize Gmail API
    const gmail = gmailApi({ version: 'v1', auth: oauth2Client });
    // Server implementation
    const { accountName } = getRuntimePaths();
    const server = new Server({
        name: `gmail-${accountName}`,
        version: "1.1.0",
        capabilities: {
            tools: {},
        },
    });
    // Tool handlers
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
            {
                name: "send_email",
                description: "Sends a new email",
                inputSchema: zodToJsonSchema(SendEmailSchema),
            },
            {
                name: "draft_email",
                description: "Draft a new email",
                inputSchema: zodToJsonSchema(SendEmailSchema),
            },
            {
                name: "read_email",
                description: "Retrieves the content of a specific email",
                inputSchema: zodToJsonSchema(ReadEmailSchema),
            },
            {
                name: "search_emails",
                description: "Searches for emails using Gmail search syntax",
                inputSchema: zodToJsonSchema(SearchEmailsSchema),
            },
            {
                name: "modify_email",
                description: "Modifies email labels (move to different folders)",
                inputSchema: zodToJsonSchema(ModifyEmailSchema),
            },
            {
                name: "delete_email",
                description: "Permanently deletes an email",
                inputSchema: zodToJsonSchema(DeleteEmailSchema),
            },
            {
                name: "list_email_labels",
                description: "Retrieves all available Gmail labels",
                inputSchema: zodToJsonSchema(ListEmailLabelsSchema),
            },
            {
                name: "batch_modify_emails",
                description: "Modifies labels for multiple emails in batches",
                inputSchema: zodToJsonSchema(BatchModifyEmailsSchema),
            },
            {
                name: "batch_delete_emails",
                description: "Permanently deletes multiple emails in batches",
                inputSchema: zodToJsonSchema(BatchDeleteEmailsSchema),
            },
            {
                name: "create_label",
                description: "Creates a new Gmail label",
                inputSchema: zodToJsonSchema(CreateLabelSchema),
            },
            {
                name: "update_label",
                description: "Updates an existing Gmail label",
                inputSchema: zodToJsonSchema(UpdateLabelSchema),
            },
            {
                name: "delete_label",
                description: "Deletes a Gmail label",
                inputSchema: zodToJsonSchema(DeleteLabelSchema),
            },
            {
                name: "get_or_create_label",
                description: "Gets an existing label by name or creates it if it doesn't exist",
                inputSchema: zodToJsonSchema(GetOrCreateLabelSchema),
            },
            {
                name: "create_filter",
                description: "Creates a new Gmail filter with custom criteria and actions",
                inputSchema: zodToJsonSchema(CreateFilterSchema),
            },
            {
                name: "list_filters",
                description: "Retrieves all Gmail filters",
                inputSchema: zodToJsonSchema(ListFiltersSchema),
            },
            {
                name: "get_filter",
                description: "Gets details of a specific Gmail filter",
                inputSchema: zodToJsonSchema(GetFilterSchema),
            },
            {
                name: "delete_filter",
                description: "Deletes a Gmail filter",
                inputSchema: zodToJsonSchema(DeleteFilterSchema),
            },
            {
                name: "create_filter_from_template",
                description: "Creates a filter using a pre-defined template for common scenarios",
                inputSchema: zodToJsonSchema(CreateFilterFromTemplateSchema),
            },
            {
                name: "download_attachment",
                description: "Downloads an email attachment to a specified location",
                inputSchema: zodToJsonSchema(DownloadAttachmentSchema),
            },
            {
                name: "get_label_info",
                description: "Returns stats for a Gmail label: total messages, unread count, total threads, unread threads. Use label name like INBOX, UNREAD, SENT, or a custom label name.",
                inputSchema: zodToJsonSchema(GetLabelInfoSchema),
            },
            {
                name: "count_emails",
                description: "Counts emails matching a Gmail search query. Paginates through all results efficiently — no 500 limit. Supports time brackets: after:2026/03/01, before:2026/03/28, newer_than:7d, older_than:30d.",
                inputSchema: zodToJsonSchema(CountEmailsSchema),
            },
        ],
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        async function handleEmailAction(action, validatedArgs) {
            let message;
            try {
                // Check if we have attachments
                if (validatedArgs.attachments && validatedArgs.attachments.length > 0) {
                    // Use Nodemailer to create properly formatted RFC822 message
                    message = await createEmailWithNodemailer(validatedArgs);
                    if (action === "send") {
                        const encodedMessage = Buffer.from(message).toString('base64')
                            .replace(/\+/g, '-')
                            .replace(/\//g, '_')
                            .replace(/=+$/, '');
                        const result = await gmail.users.messages.send({
                            userId: 'me',
                            requestBody: {
                                raw: encodedMessage,
                                ...(validatedArgs.threadId && { threadId: validatedArgs.threadId })
                            }
                        });
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Email sent successfully with ID: ${result.data.id}`,
                                },
                            ],
                        };
                    }
                    else {
                        // For drafts with attachments, use the raw message
                        const encodedMessage = Buffer.from(message).toString('base64')
                            .replace(/\+/g, '-')
                            .replace(/\//g, '_')
                            .replace(/=+$/, '');
                        const messageRequest = {
                            raw: encodedMessage,
                            ...(validatedArgs.threadId && { threadId: validatedArgs.threadId })
                        };
                        const response = await gmail.users.drafts.create({
                            userId: 'me',
                            requestBody: {
                                message: messageRequest,
                            },
                        });
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Email draft created successfully with ID: ${response.data.id}`,
                                },
                            ],
                        };
                    }
                }
                else {
                    // For emails without attachments, use the existing simple method
                    message = createEmailMessage(validatedArgs);
                    const encodedMessage = Buffer.from(message).toString('base64')
                        .replace(/\+/g, '-')
                        .replace(/\//g, '_')
                        .replace(/=+$/, '');
                    const messageRequest = {
                        raw: encodedMessage,
                    };
                    // Add threadId if specified
                    if (validatedArgs.threadId) {
                        messageRequest.threadId = validatedArgs.threadId;
                    }
                    if (action === "send") {
                        const response = await gmail.users.messages.send({
                            userId: 'me',
                            requestBody: messageRequest,
                        });
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Email sent successfully with ID: ${response.data.id}`,
                                },
                            ],
                        };
                    }
                    else {
                        const response = await gmail.users.drafts.create({
                            userId: 'me',
                            requestBody: {
                                message: messageRequest,
                            },
                        });
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Email draft created successfully with ID: ${response.data.id}`,
                                },
                            ],
                        };
                    }
                }
            }
            catch (error) {
                // Log attachment-related errors for debugging
                if (validatedArgs.attachments && validatedArgs.attachments.length > 0) {
                    console.error(`Failed to send email with ${validatedArgs.attachments.length} attachments:`, error.message);
                }
                throw error;
            }
        }
        // Helper function to process operations in batches
        async function processBatches(items, batchSize, processFn) {
            const successes = [];
            const failures = [];
            // Process in batches
            for (let i = 0; i < items.length; i += batchSize) {
                const batch = items.slice(i, i + batchSize);
                try {
                    const results = await processFn(batch);
                    successes.push(...results);
                }
                catch (error) {
                    // If batch fails, try individual items
                    for (const item of batch) {
                        try {
                            const result = await processFn([item]);
                            successes.push(...result);
                        }
                        catch (itemError) {
                            failures.push({ item, error: itemError });
                        }
                    }
                }
            }
            return { successes, failures };
        }
        try {
            switch (name) {
                case "send_email":
                case "draft_email": {
                    const validatedArgs = SendEmailSchema.parse(args);
                    const action = name === "send_email" ? "send" : "draft";
                    return await handleEmailAction(action, validatedArgs);
                }
                case "read_email": {
                    const validatedArgs = ReadEmailSchema.parse(args);
                    const response = await gmail.users.messages.get({
                        userId: 'me',
                        id: validatedArgs.messageId,
                        format: 'full',
                    });
                    const headers = response.data.payload?.headers || [];
                    const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '';
                    const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
                    const to = headers.find(h => h.name?.toLowerCase() === 'to')?.value || '';
                    const date = headers.find(h => h.name?.toLowerCase() === 'date')?.value || '';
                    const threadId = response.data.threadId || '';
                    // Extract email content using the recursive function
                    const { text, html } = extractEmailContent(response.data.payload || {});
                    // Use plain text content if available, otherwise use HTML content
                    // (optionally, you could implement HTML-to-text conversion here)
                    let body = text || html || '';
                    // If we only have HTML content, add a note for the user
                    const contentTypeNote = !text && html ?
                        '[Note: This email is HTML-formatted. Plain text version not available.]\n\n' : '';
                    // Get attachment information
                    const attachments = [];
                    const processAttachmentParts = (part, path = '') => {
                        if (part.body && part.body.attachmentId) {
                            const filename = part.filename || `attachment-${part.body.attachmentId}`;
                            attachments.push({
                                id: part.body.attachmentId,
                                filename: filename,
                                mimeType: part.mimeType || 'application/octet-stream',
                                size: part.body.size || 0
                            });
                        }
                        if (part.parts) {
                            part.parts.forEach((subpart) => processAttachmentParts(subpart, `${path}/parts`));
                        }
                    };
                    if (response.data.payload) {
                        processAttachmentParts(response.data.payload);
                    }
                    // Add attachment info to output if any are present
                    const attachmentInfo = attachments.length > 0 ?
                        `\n\nAttachments (${attachments.length}):\n` +
                            attachments.map(a => `- ${a.filename} (${a.mimeType}, ${Math.round(a.size / 1024)} KB, ID: ${a.id})`).join('\n') : '';
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Thread ID: ${threadId}\nSubject: ${subject}\nFrom: ${from}\nTo: ${to}\nDate: ${date}\n\n${contentTypeNote}${body}${attachmentInfo}`,
                            },
                        ],
                    };
                }
                case "search_emails": {
                    const validatedArgs = SearchEmailsSchema.parse(args);
                    const response = await gmail.users.messages.list({
                        userId: 'me',
                        q: validatedArgs.query,
                        maxResults: Math.min(validatedArgs.maxResults || 10, 500),
                        pageToken: validatedArgs.pageToken,
                    });
                    const messages = response.data.messages || [];
                    const nextPageToken = response.data.nextPageToken;
                    const results = await Promise.all(messages.map(async (msg) => {
                        const detail = await gmail.users.messages.get({
                            userId: 'me',
                            id: msg.id,
                            format: 'metadata',
                            metadataHeaders: ['Subject', 'From', 'Date'],
                        });
                        const headers = detail.data.payload?.headers || [];
                        return {
                            id: msg.id,
                            subject: headers.find(h => h.name === 'Subject')?.value || '',
                            from: headers.find(h => h.name === 'From')?.value || '',
                            date: headers.find(h => h.name === 'Date')?.value || '',
                        };
                    }));
                    const footer = nextPageToken
                        ? `\n--- ${results.length} results. More available. nextPageToken: ${nextPageToken} ---`
                        : `\n--- ${results.length} results (end of list) ---`;
                    return {
                        content: [
                            {
                                type: "text",
                                text: results.map(r => `ID: ${r.id}\nSubject: ${r.subject}\nFrom: ${r.from}\nDate: ${r.date}\n`).join('\n') + footer,
                            },
                        ],
                    };
                }
                // Updated implementation for the modify_email handler
                case "modify_email": {
                    const validatedArgs = ModifyEmailSchema.parse(args);
                    // Prepare request body
                    const requestBody = {};
                    if (validatedArgs.labelIds) {
                        requestBody.addLabelIds = validatedArgs.labelIds;
                    }
                    if (validatedArgs.addLabelIds) {
                        requestBody.addLabelIds = validatedArgs.addLabelIds;
                    }
                    if (validatedArgs.removeLabelIds) {
                        requestBody.removeLabelIds = validatedArgs.removeLabelIds;
                    }
                    await gmail.users.messages.modify({
                        userId: 'me',
                        id: validatedArgs.messageId,
                        requestBody: requestBody,
                    });
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Email ${validatedArgs.messageId} labels updated successfully`,
                            },
                        ],
                    };
                }
                case "delete_email": {
                    const validatedArgs = DeleteEmailSchema.parse(args);
                    await gmail.users.messages.delete({
                        userId: 'me',
                        id: validatedArgs.messageId,
                    });
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Email ${validatedArgs.messageId} deleted successfully`,
                            },
                        ],
                    };
                }
                case "list_email_labels": {
                    const labelResults = await listLabels(gmail);
                    const systemLabels = labelResults.system;
                    const userLabels = labelResults.user;
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Found ${labelResults.count.total} labels (${labelResults.count.system} system, ${labelResults.count.user} user):\n\n` +
                                    "System Labels:\n" +
                                    systemLabels.map((l) => `ID: ${l.id}\nName: ${l.name}\n`).join('\n') +
                                    "\nUser Labels:\n" +
                                    userLabels.map((l) => `ID: ${l.id}\nName: ${l.name}\n`).join('\n')
                            },
                        ],
                    };
                }
                case "batch_modify_emails": {
                    const validatedArgs = BatchModifyEmailsSchema.parse(args);
                    const messageIds = validatedArgs.messageIds;
                    const batchSize = validatedArgs.batchSize || 50;
                    // Prepare request body
                    const requestBody = {};
                    if (validatedArgs.addLabelIds) {
                        requestBody.addLabelIds = validatedArgs.addLabelIds;
                    }
                    if (validatedArgs.removeLabelIds) {
                        requestBody.removeLabelIds = validatedArgs.removeLabelIds;
                    }
                    // Process messages in batches
                    const { successes, failures } = await processBatches(messageIds, batchSize, async (batch) => {
                        const results = await Promise.all(batch.map(async (messageId) => {
                            const result = await gmail.users.messages.modify({
                                userId: 'me',
                                id: messageId,
                                requestBody: requestBody,
                            });
                            return { messageId, success: true };
                        }));
                        return results;
                    });
                    // Generate summary of the operation
                    const successCount = successes.length;
                    const failureCount = failures.length;
                    let resultText = `Batch label modification complete.\n`;
                    resultText += `Successfully processed: ${successCount} messages\n`;
                    if (failureCount > 0) {
                        resultText += `Failed to process: ${failureCount} messages\n\n`;
                        resultText += `Failed message IDs:\n`;
                        resultText += failures.map(f => `- ${f.item.substring(0, 16)}... (${f.error.message})`).join('\n');
                    }
                    return {
                        content: [
                            {
                                type: "text",
                                text: resultText,
                            },
                        ],
                    };
                }
                case "batch_delete_emails": {
                    const validatedArgs = BatchDeleteEmailsSchema.parse(args);
                    const messageIds = validatedArgs.messageIds;
                    const batchSize = validatedArgs.batchSize || 50;
                    // Process messages in batches
                    const { successes, failures } = await processBatches(messageIds, batchSize, async (batch) => {
                        const results = await Promise.all(batch.map(async (messageId) => {
                            await gmail.users.messages.delete({
                                userId: 'me',
                                id: messageId,
                            });
                            return { messageId, success: true };
                        }));
                        return results;
                    });
                    // Generate summary of the operation
                    const successCount = successes.length;
                    const failureCount = failures.length;
                    let resultText = `Batch delete operation complete.\n`;
                    resultText += `Successfully deleted: ${successCount} messages\n`;
                    if (failureCount > 0) {
                        resultText += `Failed to delete: ${failureCount} messages\n\n`;
                        resultText += `Failed message IDs:\n`;
                        resultText += failures.map(f => `- ${f.item.substring(0, 16)}... (${f.error.message})`).join('\n');
                    }
                    return {
                        content: [
                            {
                                type: "text",
                                text: resultText,
                            },
                        ],
                    };
                }
                // New label management handlers
                case "create_label": {
                    const validatedArgs = CreateLabelSchema.parse(args);
                    const result = await createLabel(gmail, validatedArgs.name, {
                        messageListVisibility: validatedArgs.messageListVisibility,
                        labelListVisibility: validatedArgs.labelListVisibility,
                    });
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Label created successfully:\nID: ${result.id}\nName: ${result.name}\nType: ${result.type}`,
                            },
                        ],
                    };
                }
                case "update_label": {
                    const validatedArgs = UpdateLabelSchema.parse(args);
                    // Prepare request body with only the fields that were provided
                    const updates = {};
                    if (validatedArgs.name)
                        updates.name = validatedArgs.name;
                    if (validatedArgs.messageListVisibility)
                        updates.messageListVisibility = validatedArgs.messageListVisibility;
                    if (validatedArgs.labelListVisibility)
                        updates.labelListVisibility = validatedArgs.labelListVisibility;
                    const result = await updateLabel(gmail, validatedArgs.id, updates);
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Label updated successfully:\nID: ${result.id}\nName: ${result.name}\nType: ${result.type}`,
                            },
                        ],
                    };
                }
                case "delete_label": {
                    const validatedArgs = DeleteLabelSchema.parse(args);
                    const result = await deleteLabel(gmail, validatedArgs.id);
                    return {
                        content: [
                            {
                                type: "text",
                                text: result.message,
                            },
                        ],
                    };
                }
                case "get_or_create_label": {
                    const validatedArgs = GetOrCreateLabelSchema.parse(args);
                    const result = await getOrCreateLabel(gmail, validatedArgs.name, {
                        messageListVisibility: validatedArgs.messageListVisibility,
                        labelListVisibility: validatedArgs.labelListVisibility,
                    });
                    const action = result.type === 'user' && result.name === validatedArgs.name ? 'found existing' : 'created new';
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Successfully ${action} label:\nID: ${result.id}\nName: ${result.name}\nType: ${result.type}`,
                            },
                        ],
                    };
                }
                // Filter management handlers
                case "create_filter": {
                    const validatedArgs = CreateFilterSchema.parse(args);
                    const result = await createFilter(gmail, validatedArgs.criteria, validatedArgs.action);
                    // Format criteria for display
                    const criteriaText = Object.entries(validatedArgs.criteria)
                        .filter(([_, value]) => value !== undefined)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(', ');
                    // Format actions for display
                    const actionText = Object.entries(validatedArgs.action)
                        .filter(([_, value]) => value !== undefined && (Array.isArray(value) ? value.length > 0 : true))
                        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
                        .join(', ');
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Filter created successfully:\nID: ${result.id}\nCriteria: ${criteriaText}\nActions: ${actionText}`,
                            },
                        ],
                    };
                }
                case "list_filters": {
                    const result = await listFilters(gmail);
                    const filters = result.filters;
                    if (filters.length === 0) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: "No filters found.",
                                },
                            ],
                        };
                    }
                    const filtersText = filters.map((filter) => {
                        const criteriaEntries = Object.entries(filter.criteria || {})
                            .filter(([_, value]) => value !== undefined)
                            .map(([key, value]) => `${key}: ${value}`)
                            .join(', ');
                        const actionEntries = Object.entries(filter.action || {})
                            .filter(([_, value]) => value !== undefined && (Array.isArray(value) ? value.length > 0 : true))
                            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
                            .join(', ');
                        return `ID: ${filter.id}\nCriteria: ${criteriaEntries}\nActions: ${actionEntries}\n`;
                    }).join('\n');
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Found ${result.count} filters:\n\n${filtersText}`,
                            },
                        ],
                    };
                }
                case "get_filter": {
                    const validatedArgs = GetFilterSchema.parse(args);
                    const result = await getFilter(gmail, validatedArgs.filterId);
                    const criteriaText = Object.entries(result.criteria || {})
                        .filter(([_, value]) => value !== undefined)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(', ');
                    const actionText = Object.entries(result.action || {})
                        .filter(([_, value]) => value !== undefined && (Array.isArray(value) ? value.length > 0 : true))
                        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
                        .join(', ');
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Filter details:\nID: ${result.id}\nCriteria: ${criteriaText}\nActions: ${actionText}`,
                            },
                        ],
                    };
                }
                case "delete_filter": {
                    const validatedArgs = DeleteFilterSchema.parse(args);
                    const result = await deleteFilter(gmail, validatedArgs.filterId);
                    return {
                        content: [
                            {
                                type: "text",
                                text: result.message,
                            },
                        ],
                    };
                }
                case "create_filter_from_template": {
                    const validatedArgs = CreateFilterFromTemplateSchema.parse(args);
                    const template = validatedArgs.template;
                    const params = validatedArgs.parameters;
                    let filterConfig;
                    switch (template) {
                        case 'fromSender':
                            if (!params.senderEmail)
                                throw new Error("senderEmail is required for fromSender template");
                            filterConfig = filterTemplates.fromSender(params.senderEmail, params.labelIds, params.archive);
                            break;
                        case 'withSubject':
                            if (!params.subjectText)
                                throw new Error("subjectText is required for withSubject template");
                            filterConfig = filterTemplates.withSubject(params.subjectText, params.labelIds, params.markAsRead);
                            break;
                        case 'withAttachments':
                            filterConfig = filterTemplates.withAttachments(params.labelIds);
                            break;
                        case 'largeEmails':
                            if (!params.sizeInBytes)
                                throw new Error("sizeInBytes is required for largeEmails template");
                            filterConfig = filterTemplates.largeEmails(params.sizeInBytes, params.labelIds);
                            break;
                        case 'containingText':
                            if (!params.searchText)
                                throw new Error("searchText is required for containingText template");
                            filterConfig = filterTemplates.containingText(params.searchText, params.labelIds, params.markImportant);
                            break;
                        case 'mailingList':
                            if (!params.listIdentifier)
                                throw new Error("listIdentifier is required for mailingList template");
                            filterConfig = filterTemplates.mailingList(params.listIdentifier, params.labelIds, params.archive);
                            break;
                        default:
                            throw new Error(`Unknown template: ${template}`);
                    }
                    const result = await createFilter(gmail, filterConfig.criteria, filterConfig.action);
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Filter created from template '${template}':\nID: ${result.id}\nTemplate used: ${template}`,
                            },
                        ],
                    };
                }
                case "download_attachment": {
                    const validatedArgs = DownloadAttachmentSchema.parse(args);
                    try {
                        // Get the attachment data from Gmail API
                        const attachmentResponse = await gmail.users.messages.attachments.get({
                            userId: 'me',
                            messageId: validatedArgs.messageId,
                            id: validatedArgs.attachmentId,
                        });
                        if (!attachmentResponse.data.data) {
                            throw new Error('No attachment data received');
                        }
                        // Decode the base64 data
                        const data = attachmentResponse.data.data;
                        const buffer = Buffer.from(data, 'base64url');
                        // Determine save path and filename
                        const savePath = validatedArgs.savePath || process.cwd();
                        let filename = validatedArgs.filename;
                        if (!filename) {
                            // Get original filename from message if not provided
                            const messageResponse = await gmail.users.messages.get({
                                userId: 'me',
                                id: validatedArgs.messageId,
                                format: 'full',
                            });
                            // Find the attachment part to get original filename
                            const findAttachment = (part) => {
                                if (part.body && part.body.attachmentId === validatedArgs.attachmentId) {
                                    return part.filename || `attachment-${validatedArgs.attachmentId}`;
                                }
                                if (part.parts) {
                                    for (const subpart of part.parts) {
                                        const found = findAttachment(subpart);
                                        if (found)
                                            return found;
                                    }
                                }
                                return null;
                            };
                            filename = findAttachment(messageResponse.data.payload) || `attachment-${validatedArgs.attachmentId}`;
                        }
                        // Ensure save directory exists
                        if (!fs.existsSync(savePath)) {
                            fs.mkdirSync(savePath, { recursive: true });
                        }
                        // Write file
                        const fullPath = path.join(savePath, filename);
                        fs.writeFileSync(fullPath, buffer);
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Attachment downloaded successfully:\nFile: ${filename}\nSize: ${buffer.length} bytes\nSaved to: ${fullPath}`,
                                },
                            ],
                        };
                    }
                    catch (error) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Failed to download attachment: ${error.message}`,
                                },
                            ],
                        };
                    }
                }
                case "get_label_info": {
                    const validatedArgs = GetLabelInfoSchema.parse(args);
                    const labelId = validatedArgs.labelName.toUpperCase();
                    // Try as system label ID first, then search by name
                    let label;
                    try {
                        const res = await gmail.users.labels.get({ userId: 'me', id: labelId });
                        label = res.data;
                    }
                    catch {
                        // Not a system label — search by name
                        const listRes = await gmail.users.labels.list({ userId: 'me' });
                        const match = (listRes.data.labels || []).find(l => l.name?.toLowerCase() === validatedArgs.labelName.toLowerCase());
                        if (!match?.id)
                            throw new Error(`Label not found: ${validatedArgs.labelName}`);
                        const res = await gmail.users.labels.get({ userId: 'me', id: match.id });
                        label = res.data;
                    }
                    return {
                        content: [{
                                type: "text",
                                text: [
                                    `Label: ${label.name}`,
                                    `Messages total: ${label.messagesTotal ?? 'n/a'}`,
                                    `Messages unread: ${label.messagesUnread ?? 'n/a'}`,
                                    `Threads total: ${label.threadsTotal ?? 'n/a'}`,
                                    `Threads unread: ${label.threadsUnread ?? 'n/a'}`,
                                ].join('\n'),
                            }],
                    };
                }
                case "count_emails": {
                    const validatedArgs = CountEmailsSchema.parse(args);
                    let total = 0;
                    let pageToken;
                    do {
                        const res = await gmail.users.messages.list({
                            userId: 'me',
                            q: validatedArgs.query,
                            maxResults: 500,
                            pageToken,
                            fields: 'nextPageToken,resultSizeEstimate,messages/id',
                        });
                        total += (res.data.messages || []).length;
                        pageToken = res.data.nextPageToken || undefined;
                    } while (pageToken);
                    return {
                        content: [{
                                type: "text",
                                text: `Count: ${total}\nQuery: ${validatedArgs.query}`,
                            }],
                    };
                }
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        }
        catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error: ${error.message}`,
                    },
                ],
            };
        }
    });
    const transport = new StdioServerTransport();
    server.connect(transport);
}
main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
});
