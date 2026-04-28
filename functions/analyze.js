exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" }, body: "" };
  }
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Content-Type": "application/json" };

  try {
    // Verificar tamaño del body (Netlify límite: 1MB)
    const bodySize = (event.body || "").length;
    console.log(`[SafeBite] analyze called, body size: ${bodySize} bytes`);
    if (bodySize > 950000) {
      return { statusCode: 413, headers, body: JSON.stringify({ error: "Imagen demasiado grande. Fotografía solo la lista de ingredientes con buena luz." }) };
    }

    const { imageDataUrl, allergens, childName, mode } = JSON.parse(event.body);
    const openaiKey = process.env.OPENAI_KEY;
    const claudeKey = process.env.ANTHROPIC_KEY;

    if (!openaiKey) throw new Error("OPENAI_KEY no configurada");

    const allergenCtx = allergens?.length
      ? `Alérgenos del perfil de ${childName || "el niño"}: ${allergens.map(a => `${a.label} (${a.severity || "alta"})`).join(", ")}.`
      : "Sin alérgenos configurados.";

    const HIDDEN = `caseinato/caseína/caseinato sódico/suero lácteo/proteína láctea=LECHE, albúmina/ovoalbúmina/lisozima=HUEVO, sémola/espelta/cebada/centeno/malta/almidón de trigo=GLUTEN, tahini=SÉSAMO, lecitina de soja=SOJA`;

    const RULES = `REGLAS: 1) Detecta derivados ocultos: ${HIDDEN}. 2) Si gravedad GRAVE y hay trazas → NO APTO. 3) Explica en 2 frases como padre. 4) Ante la duda → NO APTO. Responde SOLO JSON: {"status":"APTO"|"PRECAUCION"|"NO APTO","confidence":"alta"|"media"|"baja","explanation":"...","risks":[],"hidden_allergens":[],"traces_warning":true|false,"ingredients_found":"..."}`;

    let ingredientsText = "";
    let apiUsed = "claude";

    // ── TEXT mode: Claude directly (fast, no OCR needed) ──────────────────────
    if (mode === "text") {
      ingredientsText = imageDataUrl;

      if (!claudeKey) throw new Error("ANTHROPIC_KEY no configurada");

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": claudeKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 400,
          messages: [{ role: "user", content: `${allergenCtx}\n\n${RULES}\n\nINGREDIENTES:\n${ingredientsText}` }]
        })
      });

      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(`Claude: ${e.error?.message || res.status}`); }
      const d = await res.json();
      const txt = d.content?.[0]?.text || "";
      const m = txt.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Sin JSON válido");
      const result = JSON.parse(m[0]);
      result.ingredients_found = ingredientsText.substring(0, 300);
      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    // ── IMAGE mode: GPT-4o-mini OCR → Claude analysis ─────────────────────────
    if (!imageDataUrl?.startsWith("data:image")) throw new Error("Imagen no válida");

    // Step 1: OCR with GPT-4o-mini
    const ocrRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 800,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: mode === "menu"
              ? "Eres un lector OCR experto. Transcribe TODO el texto visible en esta imagen de menú de restaurante: nombres de platos, ingredientes, alérgenos, descripciones. Si la imagen es de una pantalla o PDF, esfuérzate en leer incluso el texto pequeño. Devuelve solo el texto transcrito, sin análisis ni comentarios."
              : "Eres un lector OCR experto especializado en etiquetas alimentarias. Transcribe EXACTAMENTE la lista completa de ingredientes de esta etiqueta. Si es una foto de pantalla o PDF, lee igualmente todo el texto. Incluye porcentajes, aditivos (E-xxx) y cualquier mención de alérgenos. Devuelve solo el texto, sin análisis." },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } }
          ]
        }]
      })
    });

    if (!ocrRes.ok) { const e = await ocrRes.json().catch(()=>({})); throw new Error(`OCR: ${e.error?.message || ocrRes.status}`); }
    const ocrData = await ocrRes.json();
    ingredientsText = ocrData.choices?.[0]?.message?.content || "";

    if (!ingredientsText || ingredientsText.length < 5) {
      return { statusCode: 200, headers, body: JSON.stringify({ status: "PRECAUCION", confidence: "baja", explanation: "No pude leer el texto de la imagen. Consejos: 1) Fotografía solo la etiqueta de ingredientes, 2) Asegúrate de que haya buena luz, 3) Si es una pantalla, aumenta el brillo al máximo, 4) Usa el modo Texto para pegar los ingredientes manualmente.", risks: ["Imagen ilegible — no se pueden verificar alérgenos"], hidden_allergens: [], traces_warning: false, ingredients_found: "" }) };
    }

    // Step 2: Claude analysis
    if (!claudeKey) {
      // Fallback: use GPT for analysis too
      const r2 = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini", max_tokens: 400,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: `${allergenCtx}\n\n${RULES}` },
            { role: "user", content: `INGREDIENTES:\n${ingredientsText}` }
          ]
        })
      });
      const d2 = await r2.json();
      const result = JSON.parse(d2.choices?.[0]?.message?.content || "{}");
      result.ingredients_found = ingredientsText.substring(0, 300);
      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": claudeKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{ role: "user", content: `${allergenCtx}\n\n${RULES}\n\nINGREDIENTES EXTRAÍDOS:\n${ingredientsText}` }]
      })
    });

    if (!claudeRes.ok) { const e = await claudeRes.json().catch(()=>({})); throw new Error(`Claude: ${e.error?.message || claudeRes.status}`); }
    const cd = await claudeRes.json();
    const txt2 = cd.content?.[0]?.text || "";
    const m2 = txt2.match(/\{[\s\S]*\}/);
    if (!m2) throw new Error("Sin JSON válido de Claude");
    const result2 = JSON.parse(m2[0]);
    result2.ingredients_found = ingredientsText.substring(0, 300);
    return { statusCode: 200, headers, body: JSON.stringify(result2) };

  } catch (err) {
    console.error("SafeBite error:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
