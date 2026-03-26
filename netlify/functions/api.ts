import express from "express";
import serverless from "serverless-http";
import { google } from "googleapis";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const drive = google.drive({
  version: "v3",
  auth: process.env.GOOGLE_DRIVE_API_KEY,
});

const sheets = google.sheets({
  version: "v4",
  auth: process.env.GOOGLE_DRIVE_API_KEY,
});

const router = express.Router();

router.post("/check-access", async (req, res) => {
  try {
    if (!process.env.GOOGLE_DRIVE_API_KEY) {
      return res.json({ allowed: false, error: "GOOGLE_DRIVE_API_KEY is missing in Netlify environment variables." });
    }

    const { email } = req.body;
    const spreadsheetId = "1jCOoDzl7hLbIpJneISIGhYF8fzg_2VEm7UjkkMiYcJM";

    if (!spreadsheetId) {
      return res.json({ allowed: false, error: "GOOGLE_SHEET_ID is not configured." });
    }

    if (email === 'mjdl05010710@gmail.com') {
      return res.json({ allowed: true });
    }

    const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetsList = sheetMeta.data.sheets;
    if (!sheetsList || sheetsList.length === 0) {
      return res.json({ allowed: false, error: "No sheets found in the document." });
    }
    
    const allowedUsersSheet = sheetsList.find(s => s.properties?.title === 'AllowedUsers');
    const targetSheetName = allowedUsersSheet ? 'AllowedUsers' : sheetsList[0].properties?.title;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${targetSheetName}!A:A`,
    });

    const rows = response.data.values;
    if (!rows) {
      return res.json({ allowed: false, error: `No users found in ${targetSheetName} tab.` });
    }

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

router.post("/logs", async (req, res) => {
  try {
    const { email, action, details, timestamp } = req.body;
    const spreadsheetId = "1jCOoDzl7hLbIpJneISIGhYF8fzg_2VEm7UjkkMiYcJM";

    if (!spreadsheetId) {
      console.warn("GOOGLE_SHEET_ID is not configured. Skipping Sheets log.");
      return res.json({ success: true, message: "Sheets ID missing, log skipped" });
    }

    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      return res.json({ 
        success: false, 
        message: "Writing to Google Sheets requires a Service Account (OAuth2). API keys are read-only. Skipping Sheets log." 
      });
    }

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
      range: "Sheet1!A:D",
      valueInputOption: "RAW",
      requestBody: {
        values: [[timestamp, email, action, details]],
      },
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("Sheets Error:", error?.message || error);
    res.json({ success: false, error: error?.message });
  }
});

router.get("/drive/images/:folderId", async (req, res) => {
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
    res.status(500).json({ error: error?.message || "Failed to fetch images from Google Drive" });
  }
});

app.use("/api", router);
app.use("/.netlify/functions/api", router);

export const handler = serverless(app);
