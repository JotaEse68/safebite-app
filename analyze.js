exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  try {
    const { imageDataUrl, allergens, childName, mode } = JSON.parse(event.body);
    const apiKey = process.env.OPENAI_KEY;

    if (!apiKey) throw new Error("OpenAI API key no configurada");

    // Build the context from allergens profile
    const allergenContext = allergens && allergens.length > 0
      ? `El perfil de ${childName || "el niño"} tiene alergia/intolerancia a: ${allergens.map(a => `${a.label} (gravedad: ${a.severity || "alta"})`).join(", ")}.`
      : `Sin alérgenos configurados en el perfil.`;

    const modeInstruction = mode === "menu"
      ? "Estás analizando el MENÚ DE UN RESTAURANTE. Identifica qué platos son seguros, cuáles no, y cuáles tienen riesgo de contaminación cruzada."
      : "Estás analizando la ETIQUETA o LISTA DE INGREDIENTES de un producto alimentario.";

    const systemPrompt = `Eres SafeBite, un asistente experto en seguridad alimentaria para familias con niños alérgicos, respaldado por Laztan (expertos certificados en alergias con sello ATX Allergy Protection).

${modeInstruction}

${allergenContext}

REGLAS CRÍTICAS:
1. Detecta tanto ingredientes directos como derivados ocultos: caseinato/caseína = leche, albúmina/ovoalbúmina = huevo, sémola/espelta/cebada = gluten, tahini = sésamo, etc.
2. Evalúa "puede contener trazas" de forma ADAPTATIVA: si la gravedad es alta, es NO APTO aunque sean trazas.
3. Explica siempre el PORQUÉ en lenguaje de padre, no de médico.
4. Sé conservador: ante la duda, NO APTO.

Responde SIEMPRE en este JSON exacto:
{
  "status": "APTO" | "PRECAUCION" | "NO APTO",
  "confidence": "alta" | "media" | "baja",
  "explanation": "Explicación breve y clara para un padre (max 2 frases)",
  "risks": ["riesgo1", "riesgo2"],
  "hidden_allergens": ["derivado oculto detectado"],
  "traces_warning": true | false,
  "safe_note": "Si es APTO, nota positiva opcional",
  "ingredients_found": "texto de ingredientes extraído de la imagen"
}`;

    const userMessage = mode === "text"
      ? [{ type: "text", text: `Analiza estos ingredientes:\n${imageDataUrl}` }]
      : [
          { type: "text", text: mode === "menu" ? "Analiza este menú de restaurante:" : "Analiza esta etiqueta de producto:" },
          { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } }
        ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 800,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Error OpenAI");

    const result = JSON.parse(data.choices[0].message.content);
    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
