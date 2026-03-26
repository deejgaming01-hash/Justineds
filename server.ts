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
  app.post("/api/logs", async (req, res) => {
    try {
      const { email, action, details, timestamp } = req.body;
      const spreadsheetId = process.env.GOOGLE_SHEET_ID;

      if (!spreadsheetId) {
        console.warn("GOOGLE_SHEET_ID is not configured. Skipping Sheets log.");
        return res.json({ success: true, message: "Sheets ID missing, log skipped" });
      }

      await sheets.spreadsheets.values.append({
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
