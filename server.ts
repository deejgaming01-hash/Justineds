import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { google } from "googleapis";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const drive = google.drive({
    version: "v3",
    auth: process.env.GOOGLE_DRIVE_API_KEY,
  });

  const sheets = google.sheets({
    version: "v4",
    auth: process.env.GOOGLE_DRIVE_API_KEY, // Reusing the same key, ensure it has Sheets API enabled
  });

  // API routes
  app.post("/api/check-access", async (req, res) => {
    try {
      const { email } = req.body;
      // Hardcoding the new sheet ID to ensure it doesn't use the old one from env vars
      const spreadsheetId = "1jCOoDzl7hLbIpJneISIGhYF8fzg_2VEm7UjkkMiYcJM";

      if (!spreadsheetId) {
        return res.json({ allowed: false, error: "GOOGLE_SHEET_ID is not configured." });
      }

      // Always allow the superadmin
      if (email === 'mjdl05010710@gmail.com') {
        return res.json({ allowed: true });
      }

      // Get spreadsheet metadata to find the first sheet's name
      const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
      const sheetsList = sheetMeta.data.sheets;
      if (!sheetsList || sheetsList.length === 0) {
        return res.json({ allowed: false, error: "No sheets found in the document." });
      }
      
      // Try to find 'AllowedUsers' tab, otherwise fallback to the first tab
      const allowedUsersSheet = sheetsList.find(s => s.properties?.title === 'AllowedUsers');
      const targetSheetName = allowedUsersSheet ? 'AllowedUsers' : sheetsList[0].properties?.title;

      // Read the target sheet, column A
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${targetSheetName}!A:A`,
      });

      const rows = response.data.values;
      if (!rows) {
        return res.json({ allowed: false, error: `No users found in ${targetSheetName} tab.` });
      }

      // Check if email exists (case insensitive)
      const allowed = rows.some(row => row[0]?.trim().toLowerCase() === email.toLowerCase());
      
      if (!allowed) {
        return res.json({ allowed: false, error: "Access Denied. Your email is not on the allowed list." });
      }

      res.json({ allowed: true });
    } catch (error: any) {
      console.error("Check Access Error:", error?.message || error);
      res.json({ allowed: false, error: "Could not read AllowedUsers tab. Make sure the tab exists in your Google Sheet." });
    }
  });

  app.post("/api/logs", async (req, res) => {
    try {
      const { email, action, details, timestamp } = req.body;
      // Hardcoding the new sheet ID
      const spreadsheetId = "1jCOoDzl7hLbIpJneISIGhYF8fzg_2VEm7UjkkMiYcJM";

      if (!spreadsheetId) {
        console.warn("GOOGLE_SHEET_ID is not configured. Skipping Sheets log.");
        return res.json({ success: true, message: "Sheets ID missing, log skipped" });
      }

      // Check if we have Service Account credentials (required for writing to Sheets)
      if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
        // We only have an API key, which is read-only. We cannot append.
        return res.json({ 
          success: false, 
          message: "Writing to Google Sheets requires a Service Account (OAuth2). API keys are read-only. Skipping Sheets log." 
        });
      }

      // If we do have a service account, we need to create an auth client for it
      const authClient = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const authSheets = google.sheets({ version: 'v4', auth: authClient });

      await authSheets.spreadsheets.values.append({
        spreadsheetId,
        range: "Sheet1!A:D", // Adjust if your sheet name is different
        valueInputOption: "RAW",
        requestBody: {
          values: [[timestamp, email, action, details]],
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Sheets Error:", error?.message || error);
      // Don't fail the request if logging fails, just log it
      res.json({ success: false, error: error?.message });
    }
  });

  app.get("/api/drive/images/:folderId", async (req, res) => {
    try {
      const { folderId } = req.params;
      if (!folderId) return res.status(400).json({ error: "Folder ID is required" });

      if (!process.env.GOOGLE_DRIVE_API_KEY) {
        console.error("GOOGLE_DRIVE_API_KEY is missing in environment variables");
        return res.status(500).json({ error: "Google Drive API key is not configured" });
      }

      const response = await drive.files.list({
        q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
        fields: "files(id, name, mimeType)",
        orderBy: "name",
      });

      if (!response.data.files || response.data.files.length === 0) {
        console.warn(`No images found in folder: ${folderId}`);
        return res.json({ images: [] });
      }

      const images = response.data.files.map(file => 
        `https://lh3.googleusercontent.com/d/${file.id}=w2000`
      );

      res.json({ images });
    } catch (error: any) {
      console.error("Drive Error:", error?.message || error);
      res.status(500).json({ error: `Failed to fetch images: ${error?.message || "Unknown error"}` });
    }
  });

  app.get("/api/drive/quiz/:folderId", async (req, res) => {
    try {
      const { folderId } = req.params;
      if (!folderId) return res.status(400).json({ error: "Folder ID is required" });

      // Find quiz.txt in the folder
      const listResponse = await drive.files.list({
        q: `'${folderId}' in parents and name = 'quiz.txt' and trashed = false`,
        fields: "files(id, name)",
      });

      const quizFile = listResponse.data.files?.[0];
      if (!quizFile) {
        return res.json({ quiz: null });
      }

      // Fetch file content
      const contentResponse = await drive.files.get({
        fileId: quizFile.id!,
        alt: "media",
      });

      res.json({ quiz: contentResponse.data });
    } catch (error) {
      console.error("Drive Error:", error);
      res.status(500).json({ error: "Failed to fetch quiz from Drive" });
    }
  });

  app.get("/api/config/supabase", (req, res) => {
    res.json({
      url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
      anonKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
