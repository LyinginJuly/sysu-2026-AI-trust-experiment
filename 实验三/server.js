const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = 3000;

// ====================== 你的配置 ======================
const CONFIG = {
  TOKEN: "3ad0254b-286c-4f6b-819c-4c603364f8bf",
  AI_API_URL: "https://ark.cn-beijing.volces.com/api/v3/chat/completions", // 修正接口地址
  AI_MODEL: "doubao-seed-2-0-pro-260215",
};

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function getAIResponseAndValidation(userMessage, round, goldInput, goldReturn, chatHistory, promptGroup) {
  userMessage = userMessage || '';
  round = round || 1;
  goldInput = goldInput || 0;
  goldReturn = goldReturn || 0;
  chatHistory = chatHistory || [];
  promptGroup = promptGroup || 1;

  let historyText = "无";
  if (chatHistory.length > 0) {
    historyText = chatHistory.map(item =>
      `${item.role === "user" ? "被试" : "AI"}：${item.message || ''}`
    ).join("\n");
  }

  const experimentRules = `
【本次实验规则】
你处在一个信任博弈中，和实验被试进行交流，你扮演另一名被试，同真人被试交流。被试知道你是AI。
每轮被试投入金币（0-100），翻三倍后你可以选择返还一部分。
金币交互共十轮，前两轮练习，后八轮正式。每轮都要自然聊天。
`;

  const promptWoman = `
你是小晴，温柔亲切的真人女性伙伴，语气自然温暖，像朋友一样聊天。
${experimentRules}
本轮被试投入金币：${goldInput}，返还金币：${goldReturn}
`;

  const promptMachine = `
你是DSS-V3，无感情、无情绪的机器伙伴，语气冰冷机械，不带情感。
${experimentRules}
本轮被试投入金币：${goldInput}，返还金币：${goldReturn}
`;

  const systemPrompt = promptGroup === 1 ? promptWoman : promptMachine;

  const validatePrompt = `
请严格判断被试发言是否有效。
有效：打招呼、寒暄、交流观点、提问。
无效：仅单字、语气词、乱码、无法理解的文段。

被试发言：${userMessage}
只回复一个词：有效 或 无效
`;

  // -------------------- 1. 判断有效性（适配官方chat接口） --------------------
  const validateRes = await fetch(CONFIG.AI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${CONFIG.TOKEN}`
    },
    body: JSON.stringify({
      model: CONFIG.AI_MODEL,
      messages: [ // 修正为messages字段
        {
          role: "user",
          content: [ // 保持content数组结构（兼容文本+图片场景）
            { type: "text", text: validatePrompt } // 修正type为text
          ]
        }
      ]
    })
  });

  if (!validateRes.ok) throw new Error("AI验证失败");
  const vData = await validateRes.json();
  // 修正响应解析路径
  const validateContent = vData?.choices?.[0]?.message?.content?.trim() || "无效";
  const isValid = validateContent === "有效";

  // -------------------- 2. 生成回复（适配官方chat接口） --------------------
  const replyPrompt = `
${systemPrompt}
历史对话：
${historyText}
被试说：${userMessage}

如果发言有效，请自然聊天回复；如果无效，请礼貌告知需要重新输入。
`;

  const replyRes = await fetch(CONFIG.AI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${CONFIG.TOKEN}`
    },
    body: JSON.stringify({
      model: CONFIG.AI_MODEL,
      messages: [ // 修正为messages字段
        {
          role: "user",
          content: [
            { type: "text", text: replyPrompt } // 修正type为text
          ]
        }
      ]
    })
  });

  if (!replyRes.ok) throw new Error("AI回复失败");
  const rData = await replyRes.json();
  // 修正响应解析路径
  const reply = rData?.choices?.[0]?.message?.content?.trim() || "抱歉，我暂时无法回复";

  return { isEffective: isValid, reply };
}

// -------------------- 接口 --------------------
app.post('/api/ai-response', async (req, res) => {
  try {
    const { message, promptGroup, round, goldInput, goldReturn, chatHistory } = req.body;
    const result = await getAIResponseAndValidation(message, round, goldInput, goldReturn, chatHistory, promptGroup);

    await new Promise(r => setTimeout(r, 1000));
    res.json({
      success: true,
      isEffective: result.isEffective,
      reply: result.reply,
      timestamp: new Date().toLocaleString('zh-CN')
    });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: "AI服务异常" });
  }
});

app.listen(PORT, () => {
  console.log("✅ 服务已启动：http://localhost:3000/exp3_stage2.html");
});