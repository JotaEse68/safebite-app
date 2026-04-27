exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  try {
    const body = JSON.parse(event.body);
    const { imageDataUrl, allergens, childName, mode, adminDocNames, childDocNames } = body;

    const openaiKey  = process.env.OPENAI_KEY;
    const claudeKey  = process.env.ANTHROPIC_KEY;

    if (!openaiKey)  throw new Error("OPENAI_KEY no configurada");
    if (!claudeKey)  throw new Error("ANTHROPIC_KEY no configurada");

    // ── STEP 1: GPT-4o-mini extracts text from image ──────────────────────────
    let ingredientsText = "";

    if (mode === "text") {
      // Already text — no OCR needed
      ingredientsText = imageDataUrl;
    } else {
      // Use GPT-4o-mini to extract text from image (fast, cheap OCR)
      const ocrPrompt = mode === "menu"
        ? "Extrae y transcribe todos los platos, ingredientes y alérgenos mencionados en este menú. Sé exhaustivo. Solo devuelve el texto extraído, sin análisis."
        : "Extrae y transcribe exactamente la lista de ingredientes de esta etiqueta de producto alimentario. Incluye todos los ingredientes aunque sean muy pequeños. Solo devuelve el texto extraído, sin análisis.";

      const ocrRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 500,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: ocrPrompt },
                { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } }
              ]
            }
          ],
        }),
      });

      if (!ocrRes.ok) {
        const err = await ocrRes.json().catch(() => ({}));
        throw new Error(`OCR error: ${err.error?.message || ocrRes.status}`);
      }

      const ocrData = await ocrRes.json();
      ingredientsText = ocrData.choices?.[0]?.message?.content || "";

      if (!ingredientsText || ingredientsText.length < 5) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            status: "PRECAUCION",
            confidence: "baja",
            explanation: "No pude leer los ingredientes de la imagen. Intenta con mejor iluminación o usa la opción de texto.",
            risks: [],
            hidden_allergens: [],
            traces_warning: false,
            ingredients_found: "",
          }),
        };
      }
    }

    // ── STEP 2: Claude analyzes the extracted text ─────────────────────────────
    const allergenContext = allergens?.length > 0
      ? `El perfil de ${childName || "el niño"} tiene alergia/intolerancia a: ${allergens.map(a => `${a.label} (gravedad: ${a.severity || "alta"})`).join(", ")}.`
      : "Sin alérgenos configurados en el perfil.";

    const knowledgeCtx = adminDocNames?.length
      ? `\nBase de conocimiento Laztan disponible: ${adminDocNames.join(", ")}.`
      : "";

    const childCtx = childDocNames?.length
      ? `\nDocumentos médicos del niño disponibles: ${childDocNames.join(", ")}.`
      : "";

    const modeCtx = mode === "menu"
      ? "Se trata de un MENÚ DE RESTAURANTE. Evalúa cada plato."
      : "Se trata de una ETIQUETA O LISTA DE INGREDIENTES de un producto alimentario.";

    const claudePrompt = `Eres SafeBite, experto en seguridad alimentaria para familias con niños alérgicos, respaldado por Laztan (sello ATX Allergy Protection, aval FACE).

${modeCtx}

${allergenContext}${knowledgeCtx}${childCtx}

INGREDIENTES A ANALIZAR:
${ingredientsText}

REGLAS CRÍTICAS:
1. Detecta ingredientes directos Y derivados ocultos:
   - caseinato / caseína / caseinato sódico / proteína de leche / suero lácteo / lactosa = LECHE
   - albúmina / ovoalbúmina / lisozima = HUEVO
   - sémola / espelta / cebada / centeno / malta / almidón de trigo = GLUTEN
   - tahini / pasta de sésamo = SÉSAMO
   - lecitina de soja / proteína de soja = SOJA
   - ácido ascórbico de trigo = GLUTEN
2. Si gravedad es GRAVE y hay trazas → NO APTO igualmente
3. Explica como padre, no como médico. Máximo 2 frases claras.
4. Ante la duda → NO APTO

Responde SOLO con este JSON exacto:
{
  "status": "APTO" | "PRECAUCION" | "NO APTO",
  "confidence": "alta" | "media" | "baja",
  "explanation": "Explicación breve para el padre",
  "risks": ["ingrediente problemático detectado"],
  "hidden_allergens": ["derivado oculto: caseinato = leche"],
  "traces_warning": true | false,
  "ingredients_found": "${ingredientsText.substring(0, 200)}"
}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": claudeKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 600,
        messages: [
          { role: "user", content: claudePrompt }
        ],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.json().catch(() => ({}));
      throw new Error(`Claude error: ${err.error?.message || claudeRes.status}`);
    }

    const claudeData = await claudeRes.json();
    const resultText = claudeData.content?.[0]?.text || "";

    // Extract JSON from Claude response
    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Claude no devolvió JSON válido");

    const result = JSON.parse(jsonMatch[0]);
    result.ingredients_found = ingredientsText.substring(0, 500);

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    console.error("SafeBite error:", err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || "Error interno del servidor" }),
    };
  }
};
