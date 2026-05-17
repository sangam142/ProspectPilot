import express from "express";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

import serverless from "serverless-http";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Gemini Initialization
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

/**
 * Lead Scraping (Geoapify)
 */
app.post("/api/leads", async (req, res) => {
  const { niche, city, state } = req.body;
  const apiKey = process.env.GEOAPIFY_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "GEOAPIFY_API_KEY is missing" });
  }

  try {
    // Step 1: Geocoding to get coordinates
    const geocodeUrl = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(`${city}, ${state}, USA`)}&apiKey=${apiKey}`;
    const geocodeRes = await axios.get(geocodeUrl);
    
    if (!geocodeRes.data.features || geocodeRes.data.features.length === 0) {
      return res.status(404).json({ error: `Location "${city}, ${state}" not found.` });
    }

    const { lon, lat } = geocodeRes.data.features[0].properties;

    // Mapping niches to Geoapify categories (v2 names)
    const categoryMap: Record<string, string> = {
      "Dentist": "healthcare.dentist",
      "Restaurant": "catering.restaurant",
      "Lawyer": "service.financial.lawyer",
      "Gym": "leisure.fitness_centre",
      "Plumber": "service.construction",
      "HVAC": "service.construction",
      "Roofer": "service.construction",
      "Accountant": "service.financial",
      "Real Estate": "service.real_estate",
      "Landscaping": "service.construction"
    };

    const categories = categoryMap[niche] || "commercial";

    // Step 2: Fetch Places using circle search
    const radius = 10000; // 10km is usually safer for cities
    const placesUrl = `https://api.geoapify.com/v2/places?categories=${categories}&filter=circle:${lon},${lat},${radius}&bias=proximity:${lon},${lat}&limit=20&apiKey=${apiKey}`;
    
    const placesRes = await axios.get(placesUrl);

    if (!placesRes.data || !placesRes.data.features || placesRes.data.features.length === 0) {
      return res.json({ leads: [], message: "No businesses found in this area with a website." });
    }

    const leads = placesRes.data.features
      .filter((f: any) => f.properties.website && f.properties.name) // Filter before mapping
      .map((f: any) => ({
        name: f.properties.name,
        website: f.properties.website,
        address: f.properties.address_line2 || f.properties.street || f.properties.city || "Address not found",
        city: f.properties.city || city,
        state: f.properties.state || state,
      }))
      .filter((l: any) => l.website.startsWith("http"));

    res.json({ leads });
  } catch (error: any) {
    const apiData = error.response?.data;
    const errorMsg = apiData?.message || 
                     (typeof apiData === 'string' ? apiData : null) || 
                     (typeof apiData === 'object' ? JSON.stringify(apiData) : null) || 
                     error.message || 
                     "Unknown error";
    console.error("Scraping error details:", errorMsg);
    res.status(500).json({ error: `Geoapify error: ${errorMsg}` });
  }
});

/**
 * Contact Extraction Logic
 */
app.post("/api/extract-contact", async (req, res) => {
  const { website } = req.body;
  if (!website) return res.status(400).json({ error: "Website URL is required" });

  try {
    const urlsToTry = [
      website,
      `${website.replace(/\/$/, "")}/contact`,
      `${website.replace(/\/$/, "")}/contact-us`,
      `${website.replace(/\/$/, "")}/about`,
      `${website.replace(/\/$/, "")}/about-us`,
      `${website.replace(/\/$/, "")}/team`,
      `${website.replace(/\/$/, "")}/locations`,
    ];

    let foundEmails: string[] = [];

    for (const url of urlsToTry) {
      try {
        const response = await axios.get(url, { 
          timeout: 5000,
          validateStatus: (status) => status < 500,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });

        if (response.status === 200) {
          const html = response.data;
          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          const matches = html.match(emailRegex);
          if (matches) foundEmails.push(...matches);
        }
      } catch (err) {
        // Skip failed subpages
      }
    }

    // Cleaning and filtering emails
    const junkWords = ["noreply", "sentry", "wix", "godaddy", ".png", ".jpg", ".jpeg", "@2x", "example.com"];
    let cleanEmails = [...new Set(foundEmails)]
      .filter(email => !junkWords.some(junk => email.toLowerCase().includes(junk)))
      .filter(email => email.length < 50);

    // Smart Sorting: Personal-looking emails first (dots), then generic
    cleanEmails.sort((a, b) => {
      const aHasDot = a.split("@")[0].includes(".");
      const bHasDot = b.split("@")[0].includes(".");
      if (aHasDot && !bHasDot) return -1;
      if (!aHasDot && bHasDot) return 1;
      return 0;
    });

    res.json({ email: cleanEmails[0] || null });
  } catch (error: any) {
    res.status(500).json({ error: "Extraction failed" });
  }
});

/**
 * Website Audit & Copywriting (Gemini Vision)
 */
app.post("/api/process-lead", async (req, res) => {
  const { website, name } = req.body;
  
  // Ensure website has protocol
  let cleanUrl = website;
  if (!cleanUrl.startsWith('http')) cleanUrl = `https://${cleanUrl}`;

  // Microlink direct image URL is often more reliable than their JSON API for simple screenshots
  const screenshotFinalUrl = `https://api.microlink.io?url=${encodeURIComponent(cleanUrl)}&screenshot=true&meta=false&embed=screenshot.url`;

  try {
    // 1. Get screenshot as base64 for Gemini Vision
    let base64Image = "";
    try {
      const response = await axios.get(screenshotFinalUrl, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: {
          'Accept': 'image/png,image/*;q=0.8'
        }
      });
      base64Image = Buffer.from(response.data).toString('base64');
    } catch (fetchErr: any) {
      console.error("Image capture error:", fetchErr.message);
      
      const isBadRequest = fetchErr.response?.status === 400;
      if (isBadRequest) {
         return res.status(500).json({ error: "The website URL seems invalid or is blocking our tools. Try visiting it manually first." });
      }

      // If direct image fails, try the JSON API as fallback
      try {
        const jsonRes = await axios.get(`https://api.microlink.io?url=${encodeURIComponent(website)}&screenshot=true`);
        const fallbackUrl = jsonRes.data?.data?.screenshot?.url;
        if (!fallbackUrl) throw new Error("No fallback URL found");
        const fallbackImg = await axios.get(fallbackUrl, { responseType: 'arraybuffer' });
        base64Image = Buffer.from(fallbackImg.data).toString('base64');
      } catch (fallbackErr: any) {
         return res.status(500).json({ error: "Could not capture website. Site might be down or blocking capture." });
      }
    }

    // 2. Audit with Gemini
    const auditPrompt = `Analyze this website screenshot for ${name}.
    Identify specific visual or structural conversion gaps (e.g. hero layout, mobile responsiveness, CTAs, font readability).
    Return as JSON: { "score": number, "findings": string[] }`;

    let auditData;
    const modelName = "gemini-3-flash-preview"; 

    const executeWithRetry = async (fn: () => any, retries = 3) => {
      for (let i = 0; i <= retries; i++) {
        try {
          return await fn();
        } catch (err: any) {
          const isRateLimit = err.message?.includes("429") || err.status === 429 || err.code === 429 || (err.response?.status === 429);
          if (isRateLimit && i < retries) {
            // Try to extract retry time from error message or response
            let waitSeconds = Math.pow(2, i+1) + Math.random();
            const errorMsg = err.message || (err.response?.data?.error?.message) || "";
            const retryMatch = errorMsg.match(/retry in ([\d.]+)s/);
            if (retryMatch) {
              waitSeconds = parseFloat(retryMatch[1]);
            }
            
            const delay = waitSeconds * 1000 + 1000; // Add 1s safety margin
            console.log(`Rate limited (429), retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${retries})`);
            await new Promise(r => setTimeout(r, Math.min(delay, 65000))); 
            continue;
          }
          throw err;
        }
      }
    };

    try {
      const auditResponse = await executeWithRetry(() => ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [
            { text: auditPrompt },
            { inlineData: { mimeType: "image/png", data: base64Image } }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              findings: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["score", "findings"]
          }
        }
      }));
      auditData = JSON.parse(auditResponse.text || "{}");
    } catch (aiErr: any) {
      console.error("Gemini Audit error:", aiErr.response?.data || aiErr.message);
      const msg = aiErr.response?.data?.error?.message || aiErr.message;
      return res.status(500).json({ error: `AI Audit failed: ${msg}` });
    }

    // 3. Draft Email with Gemini
    let emailData;
    try {
      const emailPrompt = `Draft a cold email for ${name} using the observation: ${auditData.findings?.[0] || "general UX"}.
      Rules: No flattery. Peer-to-peer. Brief. Draft as Animesh, ProspectPilot.
      Return as JSON: { "subject": string, "body": string }`;

      const emailResponse = await executeWithRetry(() => ai.models.generateContent({
        model: modelName,
        contents: [{ text: emailPrompt }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subject: { type: Type.STRING },
              body: { type: Type.STRING }
            },
            required: ["subject", "body"]
          }
        }
      }));
      emailData = JSON.parse(emailResponse.text || "{}");
    } catch (apiEmailErr: any) {
      emailData = { subject: "Feedback on your website", body: `Hi, I was looking at ${name} and had some thoughts on how to improve conversion. Would you be open to a quick chat?` };
    }

    res.json({
      audit: auditData,
      email: emailData,
      screenshot: screenshotFinalUrl
    });

  } catch (error: any) {
    console.error("Critical processing error:", error.message);
    res.status(500).json({ error: "AI Processing failed globally." });
  }
});

// Vite middleware and production build handling
async function startServer() {
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

  if (process.env.NODE_ENV !== "production" || !process.env.SERVERLESS) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export const handler = serverless(app);
