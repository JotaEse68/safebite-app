exports.handler = async (event) => {
  // Handle CORS preflight
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
    const apiKey = process.env.OPENAI_KEY;

    if (!apiKey) throw new Error("OpenAI API key no configurada");

    const allergenContext = allergens && allergens.length > 0
      ? `El perfil de ${childName || "el niño"} tiene alergia/intolerancia a: ${allergens.map(a => `${a.label} (gravedad: ${a.severity || "alta"})`).join(", ")}.`
      : `Sin alérgenos configurados en el perfil.`;

    const modeInstruction = mode === "menu"
      ? "Estás analizando el MENÚ DE UN RESTAURANTE. Identifica qué platos son seguros, cuáles no, y cuáles tienen riesgo de contaminación cruzada."
      : "Estás analizando la ETIQUETA o LISTA DE INGREDIENTES de un producto alimentario.";

    // Knowledge base context
    const knowledgeCtx = adminDocNames?.length
      ? `\nBase de conocimiento Laztan disponible: ${adminDocNames.join(", ")}.`
      : "";
    const childCtx = childDocNames?.length
      ? `\nDocumentos médicos del niño disponibles: ${childDocNames.join(", ")}.`
      : "";

    const systemPrompt = `Eres SafeBite, asistente experto en seguridad alimentaria para familias con niños alérgicos, respaldado por Laztan (sello ATX Allergy Protection).

${modeInstruction}

${allergenContext}${knowledgeCtx}${childCtx}

REGLAS CRÍTICAS:
1. Detecta ingredientes directos Y derivados ocultos: caseinato/caseína/caseinato sódico = LECHE, albúmina/ovoalbúmina = HUEVO, sémola/espelta/cebada/centeno/malta = GLUTEN, tahini/pasta de sésamo = SÉSAMO, lecitina de soja = SOJA, etc.
2. Si la gravedad es GRAVE y hay trazas — marca como NO APTO igualmente.
3. Explica en lenguaje de padre, no de médico.
4. Ante la duda, NO APTO.
5. Si la imagen no es una etiqueta/menú/lista de ingredientes, responde con status PRECAUCION y explanation explicando qué necesitas ver.

Responde SOLO con este JSON exacto sin texto adicional:
{
  "status": "APTO" | "PRECAUCION" | "NO APTO",
  "confidence": "alta" | "media" | "baja",
  "explanation": "Explicación breve para un padre (máximo 2 frases)",
  "risks": ["riesgo detectado 1", "riesgo detectado 2"],
  "hidden_allergens": ["derivado oculto: caseinato = leche"],
  "traces_warning": true | false,
  "ingredients_found": "texto de ingredientes extraído de la imagen"
}`;

    let userContent;

    if (mode === "text") {
      userContent = [{ type: "text", text: `Analiza estos ingredientes:\n${imageDataUrl}` }];
    } else {
      // Validate it's a data URL with image
      if (!imageDataUrl || !imageDataUrl.startsWith("data:image")) {
        throw new Error("Imagen no válida. Asegúrate de hacer foto de la etiqueta.");
      }
      userContent = [
        { type: "text", text: mode === "menu" ? "Analiza este menú de restaurante y dime qué platos son seguros:" : "Analiza esta etiqueta de producto alimentario:" },
        { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } }
      ];
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 600,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `OpenAI error ${response.status}`);
    }

    const data = await response.json();
    const resultText = data.choices?.[0]?.message?.content;
    if (!resultText) throw new Error("Respuesta vacía de OpenAI");

    const result = JSON.parse(resultText);
    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    console.error("SafeBite analyze error:", err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || "Error interno" }),
    };
  }
};
