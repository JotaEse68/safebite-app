exports.handler = async (event) => {
  return {
    statusCode: 200,
    headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, time: new Date().toISOString(), env_openai: !!process.env.OPENAI_KEY, env_claude: !!process.env.ANTHROPIC_KEY })
  };
};
