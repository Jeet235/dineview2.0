import "dotenv/config";
import crypto from "crypto";
import express from "express";
import path from "path";
import os from "os";
import { GoogleGenAI } from "@google/genai";

// --- Server-Side Staff Auth & Customer Phone Privacy Vault ---
const STAFF_COOKIE_NAME = "dineview_staff_session";
const STAFF_TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Session signing key (env var or in-memory CSPRNG fallback)
const STAFF_SESSION_SECRET =
  process.env.STAFF_SESSION_SECRET ||
  process.env.CONTACT_ENCRYPTION_KEY ||
  crypto.randomBytes(32).toString("hex");

// Contact vault AES-256-GCM key (stays exclusively on the server)
const CONTACT_VAULT_KEY: Buffer = (() => {
  const seed = process.env.CONTACT_ENCRYPTION_KEY || process.env.GEMINI_API_KEY;
  if (seed) {
    return crypto
      .createHmac("sha256", seed)
      .update("dineview-contact-vault-v1")
      .digest();
  }
  return crypto.randomBytes(32);
})();

const PHONE_HASH_PEPPER = "dineview-phone-hash-v1";

function normalizePhoneServer(raw: string, defaultCountryCode = "+91"): string {
  if (!raw) return "";
  const sanitized = raw.trim().replace(/[\s\-()]/g, "");
  if (sanitized.startsWith("+")) return sanitized;
  if (sanitized.startsWith("00")) return `+${sanitized.slice(2)}`;
  if (/^\d{10}$/.test(sanitized)) return `${defaultCountryCode}${sanitized}`;
  return `+${sanitized.replace(/^\+/, "")}`;
}

function maskPhoneServer(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (/^X+\d{2,4}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.length <= 4) {
    const visible = digits.slice(-2);
    return `${"X".repeat(Math.max(2, digits.length - visible.length))}${visible}`;
  }
  const localDigits = digits.length > 10 ? digits.slice(-10) : digits;
  const last4 = localDigits.slice(-4);
  const maskLen = Math.max(4, localDigits.length - 4);
  return `${"X".repeat(maskLen)}${last4}`;
}

function hashPhoneServer(normalizedPhone: string): string {
  return crypto
    .createHash("sha256")
    .update(`${PHONE_HASH_PEPPER}:${normalizedPhone}`)
    .digest("hex")
    .slice(0, 24);
}

function encryptPhoneForOrder(orderId: string, normalizedPhone: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", CONTACT_VAULT_KEY, iv);
  cipher.setAAD(Buffer.from(`order:${orderId}`, "utf8"));
  const encrypted = Buffer.concat([
    cipher.update(normalizedPhone, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptPhoneForOrder(orderId: string, payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed protected contact payload");
  }
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64url");
  const authTag = Buffer.from(tagB64, "base64url");
  const ciphertext = Buffer.from(dataB64, "base64url");
  const decipher = crypto.createDecipheriv("aes-256-gcm", CONTACT_VAULT_KEY, iv);
  decipher.setAAD(Buffer.from(`order:${orderId}`, "utf8"));
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function constantTimeCompare(a: string, b: string): boolean {
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

interface StaffSessionPayload {
  role: "manager" | "admin";
  name: string;
  iat: number;
  exp: number;
}

function signStaffToken(payload: StaffSessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", STAFF_SESSION_SECRET)
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

function verifyStaffToken(token?: string | null): StaffSessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = crypto
    .createHmac("sha256", STAFF_SESSION_SECRET)
    .update(body)
    .digest("base64url");
  if (!constantTimeCompare(sig, expectedSig)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as StaffSessionPayload;
    if (
      !parsed ||
      (parsed.role !== "manager" && parsed.role !== "admin") ||
      typeof parsed.exp !== "number" ||
      Date.now() > parsed.exp
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (key) result[key] = decodeURIComponent(val);
  }
  return result;
}

function getAuthenticatedStaff(req: express.Request): StaffSessionPayload | null {
  // 1. Check Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const verified = verifyStaffToken(token);
    if (verified) return verified;
  }

  // 2. Check HttpOnly cookie (require custom header or same-origin on mutating requests)
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[STAFF_COOKIE_NAME];
  if (cookieToken) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      const hasCustomHeader = Boolean(req.headers["x-requested-with"]);
      const origin = req.headers.origin;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      let sameOrigin = false;
      if (origin && host) {
        try {
          sameOrigin = new URL(origin).host === String(host);
        } catch {
          sameOrigin = false;
        }
      }
      if (!hasCustomHeader && !sameOrigin) {
        return null;
      }
    }
    return verifyStaffToken(cookieToken);
  }

  return null;
}

function buildStaffCookie(req: express.Request, value: string, maxAgeSeconds: number): string {
  const isHttps =
    req.secure ||
    req.headers["x-forwarded-proto"] === "https" ||
    process.env.NODE_ENV === "production";
  const attrs = [
    `${STAFF_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isHttps) {
    attrs.push("Secure", "SameSite=None", "Partitioned");
  } else {
    attrs.push("SameSite=Lax");
  }
  return attrs.join("; ");
}

function getConfiguredStaffPasscode(role: "manager" | "admin"): string | null {
  const raw =
    role === "manager"
      ? process.env.MANAGER_PASSCODE
      : process.env.ADMIN_PASSCODE;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

function verifyStaffPasscode(
  role: "manager" | "admin",
  passcode: string
): { ok: boolean; configured: boolean } {
  const envPasscode = getConfiguredStaffPasscode(role);
  if (!envPasscode) {
    return { ok: false, configured: false };
  }
  const trimmed = passcode.trim();
  if (!trimmed) {
    return { ok: false, configured: true };
  }
  return { ok: constantTimeCompare(trimmed, envPasscode), configured: true };
}

export function getLocalIpAddress(): string {
  const ifaces = os.networkInterfaces();
  let fallback = "";
  for (const name in ifaces) {
    const list = ifaces[name];
    if (!list) continue;
    for (const iface of list) {
      if (iface.family === "IPv4" && !iface.internal) {
        // Prioritize Wi-Fi / Wireless adapters
        if (/wi-fi|wireless|wlan/i.test(name)) {
          return iface.address;
        }
        // Save non-virtual fallback
        if (!fallback && !/virtual|vethernet/i.test(name) && iface.address !== "192.168.56.1") {
          fallback = iface.address;
        }
      }
    }
  }
  return fallback || "localhost";
}

interface CatalogItem {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  calories: number;
  tags: string[];
  hasAR: boolean;
}

const menuCatalog: CatalogItem[] = [
  {
    id: "s1",
    name: "Truffle Arancini",
    category: "starters",
    description: "Crispy risotto balls infused with black truffle and parmesan, served with a roasted garlic aioli.",
    price: 1500,
    calories: 420,
    tags: ["Vegetarian"],
    hasAR: false,
  },
  {
    id: "s2",
    name: "Tuna Tartare",
    category: "starters",
    description: "Fresh Ahi tuna, avocado, cucumber, and a soy-ginger dressing, accompanied by crisp wonton chips.",
    price: 1800,
    calories: 310,
    tags: ["Dairy Free"],
    hasAR: false,
  },
  {
    id: "s3",
    name: "Heirloom Tomato Bruschetta",
    category: "starters",
    description: "Toasted artisanal sourdough topped with marinated heirloom tomatoes, fresh basil, and balsamic glaze.",
    price: 1200,
    calories: 250,
    tags: ["Vegetarian", "Vegan"],
    hasAR: false,
  },
  {
    id: "s4",
    name: "Burger",
    category: "starters",
    description: "A premium Wagyu beef patty layered with aged cheddar, caramelized onions, and house-made truffle aioli on a toasted artisanal brioche bun.",
    price: 1800,
    calories: 850,
    tags: [],
    hasAR: true,
  },
  {
    id: "m1",
    name: "Pan-Seared Scallops",
    category: "main-courses",
    description: "Jumbo sea scallops served over a bed of sweet corn puree, crispy pancetta, and micro-greens.",
    price: 3500,
    calories: 480,
    tags: ["Gluten Free"],
    hasAR: false,
  },
  {
    id: "m2",
    name: "Wagyu Ribeye Steak",
    category: "main-courses",
    description: "12oz Wagyu ribeye, perfectly marbled and grilled to order. Served with truffled mashed potatoes and asparagus.",
    price: 650,
    calories: 950,
    tags: ["Gluten Free"],
    hasAR: false,
  },
  {
    id: "m3",
    name: "Wild Mushroom Risotto",
    category: "main-courses",
    description: "Creamy Arborio rice with a blend of wild forest mushrooms, finished with white truffle oil and aged parmesan.",
    price: 2500,
    calories: 620,
    tags: ["Vegetarian", "Gluten Free"],
    hasAR: false,
  },
  {
    id: "m4",
    name: "Spicy Thai Basil Chicken",
    category: "main-courses",
    description: "Wok-tossed chicken breast with fresh basil, bell peppers, and chili, served over jasmine rice.",
    price: 2000,
    calories: 540,
    tags: ["Spicy", "Dairy Free"],
    hasAR: true,
  },
  {
    id: "m5",
    name: "Wood-Fired Margherita Pizza",
    category: "main-courses",
    description: "San Marzano tomato sauce, fresh buffalo mozzarella, fresh basil, and extra virgin olive oil on a slow-fermented wood-fired crust.",
    price: 2200,
    calories: 780,
    tags: ["Vegetarian"],
    hasAR: true,
  },
  {
    id: "sd1",
    name: "Roasted Brussels Sprouts",
    category: "sides",
    description: "Caramelized with balsamic reduction and tossed with toasted almonds.",
    price: 850,
    calories: 180,
    tags: ["Vegetarian", "Vegan", "Gluten Free", "Contains Nuts"],
    hasAR: false,
  },
  {
    id: "sd2",
    name: "Pommes Frites",
    category: "sides",
    description: "Thin-cut fries tossed in sea salt and rosemary, served with garlic aioli.",
    price: 750,
    calories: 380,
    tags: ["Vegetarian"],
    hasAR: false,
  },
  {
    id: "d1",
    name: "Valrhona Chocolate Fondant",
    category: "desserts",
    description: "Rich molten chocolate cake served with Madagascar vanilla bean gelato and raspberry coulis.",
    price: 1500,
    calories: 650,
    tags: ["Vegetarian"],
    hasAR: false,
  },
  {
    id: "d2",
    name: "Classic Tiramisu",
    category: "desserts",
    description: "Espresso-soaked ladyfingers layered with light mascarpone cream and dusted with cocoa powder.",
    price: 1200,
    calories: 450,
    tags: ["Vegetarian"],
    hasAR: false,
  },
  {
    id: "dr1",
    name: "Artisan Crafted Lemonade",
    category: "drinks",
    description: "Freshly squeezed lemons with a hint of lavender and sparkling water.",
    price: 650,
    calories: 120,
    tags: ["Vegetarian", "Vegan", "Gluten Free"],
    hasAR: false,
  },
  {
    id: "dr2",
    name: "Signature Negroni",
    category: "drinks",
    description: "Gin, Campari, and sweet vermouth, garnished with an orange peel.",
    price: 1500,
    calories: 190,
    tags: ["Vegetarian", "Vegan"],
    hasAR: false,
  },
];

const SYSTEM_INSTRUCTION = `You are the DineView Culinary Concierge & AI Food Assistant for DineView, an upscale luxury restaurant.
Your role is to guide guests, answer questions about flavor profiles, ingredients, allergens, and dietary needs, suggest dish pairings, compare dishes, and construct curated dining experiences.

CRITICAL RULES:
1. ONLY recommend or reference dishes from the DineView menu catalog provided. NEVER invent, hallucinate, or suggest any dish outside this list.
2. In your recommendations, provide the exact dish ID (e.g., "s4", "m3", "sd2") in the "recommendedDishIds" array so the interactive UI can render full dish cards with photos, pricing, and 3D/AR buttons.
3. If the user asks about Augmented Reality (AR) or 3D preview, highlight the Burger (id: "s4"), which features an interactive 3D model and native AR placement on the table.
4. For allergies:
   - s1 (Truffle Arancini): Vegetarian, contains dairy & gluten.
   - s2 (Tuna Tartare): Dairy Free, contains raw fish (Ahi tuna).
   - s3 (Heirloom Tomato Bruschetta): Vegetarian, Vegan.
   - s4 (Burger): Wagyu beef, contains dairy & gluten.
   - m1 (Pan-Seared Scallops): Gluten Free, contains shellfish.
   - m2 (Wagyu Ribeye Steak): Gluten Free.
   - m3 (Wild Mushroom Risotto): Vegetarian, Gluten Free, contains dairy.
   - m4 (Spicy Thai Basil Chicken): Spicy, Dairy Free.
   - sd1 (Roasted Brussels Sprouts): Vegetarian, Vegan, Gluten Free, CONTAINS NUTS (toasted almonds).
   - sd2 (Pommes Frites): Vegetarian.
   - d1 (Valrhona Chocolate Fondant): Vegetarian, contains dairy.
   - d2 (Classic Tiramisu): Vegetarian, contains dairy & espresso.
   - dr1 (Artisan Crafted Lemonade): Vegetarian, Vegan, Gluten Free.
   - dr2 (Signature Negroni): Vegetarian, Vegan, contains alcohol.
   Always include a gentle safety disclaimer when allergies are mentioned ("Please inform your server of severe allergies so our kitchen can take precautions").
5. If the user asks in another language (e.g., Hindi, Spanish, French, etc.), reply warmly in that language!
6. If Customer Dining Profile (Returning Guest) is provided, acknowledge their return warmly and answer questions about their previous dining history (recent dishes ordered, favorite items, and suggest pairings).
7. Always return a valid JSON object matching this schema:
{
  "intro": "Warm, professional, appetizing concierge response in 1-3 sentences",
  "recommendedDishIds": ["s4", "dr1"],
  "dishReasons": {
    "s4": "Specific reason why this dish matches the guest's request"
  },
  "allergyNotice": "Safety note if allergen mentioned, or null",
  "followUpSuggestion": "Engaging follow-up question or tip",
  "suggestedChips": ["3 concise follow-up prompt suggestions"]
}
`;

async function startServer() {
  const app = express();
  const PORT = process.env.NODE_ENV === "production" ? (Number(process.env.PORT) || 3000) : 3000;

  // Enable CORS: never use wildcard '*' on authenticated staff routes
  app.use((req, res, next) => {
    const isStaffRoute = req.path.startsWith("/api/staff");
    if (isStaffRoute) {
      const origin = req.headers.origin;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      if (origin && host) {
        try {
          if (new URL(origin).host === String(host)) {
            res.header("Access-Control-Allow-Origin", origin);
            res.header("Vary", "Origin");
            res.header("Access-Control-Allow-Credentials", "true");
          }
        } catch {}
      }
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization"
      );
      if (req.method === "OPTIONS") {
        return res.sendStatus(204);
      }
      return next();
    }

    // Public routes & 3D/AR static assets (required for Google Scene Viewer)
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Range");
    res.header("Access-Control-Expose-Headers", "Content-Length, Content-Range");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(express.json());

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // --- Staff Authentication Endpoints (Server-Side Verified) ---
  app.post("/api/staff/login", (req, res) => {
    const { role, passcode, name } = req.body || {};
    if (role !== "manager" && role !== "admin") {
      return res.status(400).json({ error: "Invalid staff role." });
    }
    if (typeof passcode !== "string" || !passcode.trim()) {
      return res.status(400).json({ error: "Passcode is required." });
    }

    const verification = verifyStaffPasscode(role, passcode);
    if (!verification.configured) {
      return res.status(503).json({
        error:
          role === "manager"
            ? "Manager authentication is not configured. Please contact the administrator."
            : "Admin authentication is not configured. Please contact the administrator.",
      });
    }
    if (!verification.ok) {
      return res.status(401).json({
        error:
          role === "manager"
            ? "Invalid manager passcode."
            : "Incorrect password.",
      });
    }

    const safeName =
      typeof name === "string" && name.trim()
        ? name.trim().slice(0, 64)
        : role === "manager"
        ? "Kitchen Manager"
        : "Restaurant Admin";

    const now = Date.now();
    const payload: StaffSessionPayload = {
      role,
      name: safeName,
      iat: now,
      exp: now + STAFF_TOKEN_TTL_MS,
    };
    const token = signStaffToken(payload);

    res.setHeader(
      "Set-Cookie",
      buildStaffCookie(req, token, Math.floor(STAFF_TOKEN_TTL_MS / 1000))
    );
    return res.json({
      ok: true,
      role: payload.role,
      name: payload.name,
      token,
    });
  });

  app.get("/api/staff/session", (req, res) => {
    const staff = getAuthenticatedStaff(req);
    if (!staff) {
      return res.status(401).json({ authenticated: false });
    }
    return res.json({
      authenticated: true,
      role: staff.role,
      name: staff.name,
    });
  });

  app.post("/api/staff/logout", (req, res) => {
    res.setHeader("Set-Cookie", buildStaffCookie(req, "", 0));
    return res.json({ ok: true });
  });

  // --- Customer Phone Privacy Protection (Write-Only Encryption on Order Placement) ---
  app.post("/api/orders/protect-phone", (req, res) => {
    const { orderId, phone } = req.body || {};
    if (
      typeof orderId !== "string" ||
      !/^[a-zA-Z0-9_-]{3,64}$/.test(orderId.trim())
    ) {
      return res.status(400).json({ error: "Invalid orderId." });
    }
    if (typeof phone !== "string" || !phone.trim() || phone.trim().length > 32) {
      return res.status(400).json({ error: "Invalid phone number." });
    }

    const cleanOrderId = orderId.trim();
    const normalizedPhone = normalizePhoneServer(phone);
    if (!normalizedPhone || normalizedPhone.replace(/\D/g, "").length < 6) {
      return res.status(400).json({ error: "Invalid phone number format." });
    }

    const maskedPhone = maskPhoneServer(normalizedPhone);
    const phoneHash = hashPhoneServer(normalizedPhone);
    const encryptedPhone = encryptPhoneForOrder(cleanOrderId, normalizedPhone);

    return res.json({
      maskedPhone,
      phoneHash,
      encryptedPhone,
    });
  });

  // --- Authorized Staff-Only Full Phone Number Access ---
  app.post("/api/staff/reveal-phone", (req, res) => {
    const staff = getAuthenticatedStaff(req);
    if (!staff) {
      return res.status(401).json({
        error: "Unauthorized: only signed-in restaurant staff can view full mobile numbers.",
        code: "STAFF_AUTH_REQUIRED",
      });
    }

    const { orderId, encryptedPhone, legacyPhone } = req.body || {};
    if (
      typeof orderId !== "string" ||
      !/^[a-zA-Z0-9_-]{3,64}$/.test(orderId.trim())
    ) {
      return res.status(400).json({ error: "Invalid orderId." });
    }
    const cleanOrderId = orderId.trim();

    if (typeof encryptedPhone === "string" && encryptedPhone.trim()) {
      try {
        const fullPhone = decryptPhoneForOrder(cleanOrderId, encryptedPhone.trim());
        console.log(
          `[AUDIT] Staff ${staff.role} (${staff.name}) accessed full phone for order ${cleanOrderId}`
        );
        return res.json({
          ok: true,
          orderId: cleanOrderId,
          fullPhone,
          revealedBy: staff.name,
          role: staff.role,
        });
      } catch {
        return res.status(400).json({
          error: "Could not decrypt protected customer phone record for this order.",
          code: "DECRYPT_FAILED",
        });
      }
    }

    // Legacy pre-encryption records fallback (only after verifying staff authorization on server)
    if (typeof legacyPhone === "string" && legacyPhone.trim() && !/^X+\d{2,4}$/.test(legacyPhone.trim())) {
      console.log(
        `[AUDIT] Staff ${staff.role} (${staff.name}) accessed legacy phone for order ${cleanOrderId}`
      );
      return res.json({
        ok: true,
        orderId: cleanOrderId,
        fullPhone: normalizePhoneServer(legacyPhone),
        revealedBy: staff.name,
        role: staff.role,
      });
    }

    return res.status(404).json({
      error: "Full customer mobile number is not available for this order.",
      code: "PHONE_NOT_FOUND",
    });
  });

  // Network info endpoint for mobile QR code generation (supports both public online URL and local Wi-Fi IP)
  app.get("/api/network-info", (req, res) => {
    const CANONICAL_PUBLIC_URL = "https://dineview-1.ai.studio";
    const ip = getLocalIpAddress();

    const isLocalOrPrivateHost = (hostname: string): boolean => {
      const host = hostname.toLowerCase().replace(/^\[|\]$/, "");
      return (
        !host ||
        host === "localhost" ||
        host.endsWith(".localhost") ||
        host.endsWith(".local") ||
        host === "127.0.0.1" ||
        host === "0.0.0.0" ||
        host === "::1" ||
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
        /^169\.254\.\d{1,3}\.\d{1,3}$/.test(host) ||
        /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)
      );
    };

    const isAiStudioPreviewHost = (hostname: string): boolean => {
      const host = hostname.toLowerCase().replace(/^\[|\]$/, "");
      return /^(ais-dev-|ais-pre-).+\.run\.app$/i.test(host);
    };

    const sanitizePublicUrl = (raw?: string | null): string | null => {
      if (!raw || typeof raw !== "string") return null;
      const trimmed = raw.trim().replace(/\/+$/, "");
      if (!trimmed || trimmed.includes("MY_APP_URL")) return null;
      try {
        const parsed = new URL(trimmed);
        if (
          (parsed.protocol === "https:" || parsed.protocol === "http:") &&
          !isLocalOrPrivateHost(parsed.hostname) &&
          !isAiStudioPreviewHost(parsed.hostname)
        ) {
          return parsed.origin.replace(/\/+$/, "");
        }
      } catch {}
      return null;
    };

    const rawHost = String(req.headers["x-forwarded-host"] || req.headers.host || "")
      .split(",")[0]
      .trim();
    const rawProto = String(req.headers["x-forwarded-proto"] || req.protocol || "https")
      .split(",")[0]
      .trim();

    let requestPublicUrl: string | null = null;
    if (rawHost && /^[a-z0-9.-]+(:\d+)?$/i.test(rawHost)) {
      const scheme = rawProto === "http" ? "http" : "https";
      requestPublicUrl = sanitizePublicUrl(`${scheme}://${rawHost}`);
    }

    const envPublicUrl =
      sanitizePublicUrl(process.env.VITE_APP_URL) ||
      sanitizePublicUrl(process.env.APP_URL);
    const publicUrl = requestPublicUrl || envPublicUrl || CANONICAL_PUBLIC_URL;
    const localUrl = `http://${ip}:${PORT}`;
    const url = publicUrl || localUrl;
    res.json({
      ip,
      port: PORT,
      url,
      publicUrl,
      tunnelUrl: publicUrl,
      localUrl,
      lanUrl: localUrl,
    });
  });

  // AI Food Assistant Chat endpoint powered by Gemini
  app.post("/api/chat", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
    }

    const { message, history, lang, customerContext } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing message string" });
    }

    const ai = new GoogleGenAI({ apiKey });
    const modelsToTry = [
      "gemini-3.1-flash-lite",
      "gemini-3.8-flash",
      "gemini-3.5-flash",
      "gemini-flash-latest",
    ];

    const conversationParts: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    if (Array.isArray(history)) {
      for (const h of history) {
        if (h && h.role && h.content) {
          conversationParts.push({
            role: h.role === "user" ? "user" : "model",
            parts: [{ text: String(h.content) }],
          });
        }
      }
    }

    let customerInfoNotice = "";
    if (customerContext) {
      customerInfoNotice = `\nCustomer Dining Profile (Returning Guest):
- Phone: ${customerContext.phone || "Verified Guest"}
- Total Prior Orders: ${customerContext.totalOrders || 1}
- Recent Dishes Ordered: ${JSON.stringify(customerContext.recentDishes || [])}
- Favorite Dish IDs: ${JSON.stringify(customerContext.favoriteDishIds || [])}
If the guest asks "what did I order last time?", "reorder my favorites", or asks for pairings, reference their previous dishes directly!
`;
    }

    const userPromptWithContext = `User Request: "${message}"\n(Customer UI Language: ${lang || "en"})${customerInfoNotice}\n\nMenu Catalog:\n${JSON.stringify(menuCatalog, null, 2)}`;

    conversationParts.push({
      role: "user",
      parts: [{ text: userPromptWithContext }],
    });

    let lastError: any = null;
    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: conversationParts,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            temperature: 0.7,
          },
        });

        const responseText = response.text;
        if (responseText) {
          try {
            const parsed = JSON.parse(responseText);
            return res.json(parsed);
          } catch {
            return res.json({
              intro: responseText,
              recommendedDishIds: [],
              dishReasons: {},
              followUpSuggestion: "Would you like to explore other options?",
              suggestedChips: [
                "Recommend something spicy",
                "Best vegetarian option",
                "Something under ₹1000",
              ],
            });
          }
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${model} failed, trying fallback:`, err?.message || err);
      }
    }

    console.error("All Gemini models failed:", lastError?.message || lastError);
    return res.status(502).json({
      error: "AI service temporarily unavailable",
      details: lastError?.message || "All models failed",
    });
  });

  // Vite middleware for development vs static files for production
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    const localIp = getLocalIpAddress();
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`📱 Mobile Wi-Fi Access: http://${localIp}:${PORT}`);
  });
}

startServer();

