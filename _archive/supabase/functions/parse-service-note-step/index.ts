import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type ConditionKeys =
  | "calm"
  | "slightly-unstable"
  | "agitated"
  | "seizure"
  | "no-seizure"
  | "condition-changed"
  | "condition-unchanged";

type ToiletKeys =
  | "urination"
  | "defecation"
  | "both"
  | "no-toilet"
  | "diaper"
  | "assist";

type MoodKeys = "sunny" | "cloudy-sun" | "cloudy" | "rainy" | null;
type MealFoodKeys = "all" | "half" | "none" | null;
type MealWaterKeys = "enough" | "lack" | null;
type MedicationKeys = "taken" | "forgot" | "refused" | null;
type InteractionKeys = "had" | "none" | null;

type SectionKey =
  | "condition"
  | "toilet"
  | "mood"
  | "meal"
  | "medication"
  | "familyReport";

type ServiceSections = Record<SectionKey, boolean>;

type ServiceNoteFields = {
  destination: string;
  sections: ServiceSections;
  condition: Record<ConditionKeys, boolean>;
  toilet: Record<ToiletKeys, boolean>;
  mood: MoodKeys;
  mealFood: MealFoodKeys;
  mealWater: MealWaterKeys;
  medication: MedicationKeys;
  interaction: InteractionKeys;
  memo: string;
};

type ServiceNoteResult = {
  fields: ServiceNoteFields;
  summary: string;
};

type StepId =
  | "destination"
  | "condition"
  | "toilet"
  | "mood"
  | "meal"
  | "water"
  | "medicine"
  | "family"
  | "memo"
  // デバッグ用ステップ
  | "diag-key";

type RequestPayload = {
  stepId: StepId;
  answer: string;
  current: ServiceNoteFields;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ok = (body: unknown) =>
  new Response(JSON.stringify(body ?? {}), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const err = (message: string, status = 400, extra?: Record<string, unknown>) =>
  new Response(JSON.stringify({ error: message, ...(extra ?? {}) }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4.1-mini";

const SYSTEM_PROMPT = `
あなたは訪問介護のサービス実績記録を構造化するアシスタントです。
必ず ServiceNoteFields 型の **JSON オブジェクトのみ** を返してください。
前後に日本語の説明文やコメント、コードブロック（\`\`\`json など）は一切付けないでください。

返す JSON の型:

{
  "destination": string,
  "sections": {
    "condition": boolean,
    "toilet": boolean,
    "mood": boolean,
    "meal": boolean,
    "medication": boolean,
    "familyReport": boolean
  },
  "condition": {
    "calm": boolean,
    "slightly-unstable": boolean,
    "agitated": boolean,
    "seizure": boolean,
    "no-seizure": boolean,
    "condition-changed": boolean,
    "condition-unchanged": boolean
  },
  "toilet": {
    "urination": boolean,
    "defecation": boolean,
    "both": boolean,
    "no-toilet": boolean,
    "diaper": boolean,
    "assist": boolean
  },
  "mood": "sunny" | "cloudy-sun" | "cloudy" | "rainy" | null,
  "mealFood": "all" | "half" | "none" | null,
  "mealWater": "enough" | "lack" | null,
  "medication": "taken" | "forgot" | "refused" | null,
  "interaction": "had" | "none" | null,
  "memo": string
}

ルール:
- destination: 文字列。入力に合わせて自然な表現にしてください（例「自宅→まごめ園」など）。
- sections: 各項目の表示フラグ。current.sections を基本的に引き継ぎ、ユーザーからの指示があったときのみ必要な部分を false に切り替えてください。
- condition / toilet: ブールフラグ。該当する内容のみ true、それ以外は false。
  - condition: calm, slightly-unstable, agitated, seizure, no-seizure, condition-changed, condition-unchanged
  - toilet: urination, defecation, both, no-toilet, diaper, assist
  - condition/toilet ステップでは記述から複数フラグを的確に判断してください。
- mood, mealFood, mealWater, medication, interaction: 指定の選択肢から選ぶ。該当がなければ null。
- memo: 自由記述。短文で要点のみ。不要なら空文字列。

入力として渡される JSON（current）をベースに、今回の answer を反映した
「更新後の ServiceNoteFields 全体」を JSON で1つだけ出力してください。
`.trim();

function buildUserPrompt(payload: RequestPayload) {
  return JSON.stringify(
    {
      stepId: payload.stepId,
      answer: payload.answer,
      current: payload.current,
    },
    null,
    2,
  );
}

// 👇ここに追加
function buildSummaryFromFields(f: ServiceNoteFields): string {
  const parts: string[] = [];

  // 1) 行き先
  if (f.destination && f.destination.trim()) {
    parts.push(`${f.destination}までの移動支援を行いました。`);
  }

  // 2) 状態（condition）― 大枠 ON のときだけ
  if (f.sections.condition) {
    let condText = "";
    if (f.condition["seizure"]) {
      condText =
        "移動中に軽い発作が見られたため、安全の確保と体勢の調整を行いました。";
    } else if (f.condition["agitated"]) {
      condText =
        "興奮気味な場面もあり、声かけや見守りを強めながら対応しました。";
    } else if (f.condition["slightly-unstable"]) {
      condText =
        "一時的に不安定な様子もありましたが、声かけにより落ち着かれています。";
    } else if (f.condition["calm"]) {
      condText = "全体を通して落ち着いた様子で過ごされていました。";
    }

    if (condText) {
      parts.push(condText);
    }

    if (f.condition["condition-changed"]) {
      parts.push("普段と比べて体調や様子に変化が見られました。");
    } else if (f.condition["condition-unchanged"]) {
      parts.push("体調や様子に大きな変化は見られませんでした。");
    }
  }

  // 3) トイレ関連（あれば1文だけ）― 大枠 ON のときだけ
  if (f.sections.toilet) {
    const hasToilet =
      f.toilet["urination"] ||
      f.toilet["defecation"] ||
      f.toilet["both"] ||
      f.toilet["diaper"] ||
      f.toilet["assist"];

    if (hasToilet) {
      const toiletParts: string[] = [];
      if (f.toilet["urination"] || f.toilet["both"]) toiletParts.push("排尿介助");
      if (f.toilet["defecation"] || f.toilet["both"]) toiletParts.push("排便介助");
      if (f.toilet["diaper"]) toiletParts.push("おむつ交換");
      if (f.toilet["assist"]) toiletParts.push("動作の見守りや声かけ");

      parts.push(`${toiletParts.join("・")}を行いました。`);
    }
  }

  // 4) 気分 ― 大枠 ON のときだけ
  if (f.sections.mood && f.mood) {
    const moodText =
      f.mood === "sunny"
        ? "表情も明るく比較的穏やかに過ごされています。"
        : f.mood === "cloudy-sun"
        ? "概ね穏やかですが、時折不安そうな様子も見られました。"
        : f.mood === "cloudy"
        ? "やや元気がない様子も見られました。"
        : "不安定な様子が見られたため、こまめに声かけを行いました。";
    parts.push(moodText);
  }

  // 5) 食事・水分 ― 大枠 ON かつ値ありのときだけ
  if (f.sections.meal && (f.mealFood || f.mealWater)) {
    const mealTexts: string[] = [];

    if (f.mealFood === "all") {
      mealTexts.push("食事は全量摂取されています");
    } else if (f.mealFood === "half") {
      mealTexts.push("食事は半量程度の摂取でした");
    } else if (f.mealFood === "none") {
      mealTexts.push("食事はほとんど摂取されませんでした");
    }

    if (f.mealWater === "enough") {
      mealTexts.push("水分は十分に摂取されています");
    } else if (f.mealWater === "lack") {
      mealTexts.push("水分摂取がやや少ない印象でした");
    }

    if (mealTexts.length > 0) {
      parts.push(mealTexts.join("。") + "。");
    }
  }

  // 6) 服薬 ― 大枠 ON かつ値ありのときだけ
  if (f.sections.medication && f.medication) {
    const medText =
      f.medication === "taken"
        ? "服薬は指示どおり行えています。"
        : f.medication === "forgot"
        ? "服薬の失念が見られたため、確認と声かけを行いました。"
        : "服薬の拒否が見られたため、状況を共有しつつ様子を見ています。";
    parts.push(medText);
  }

  // 7) メモ（40文字まで）※「メモ:」ラベルは出さず、本文に自然文で統合
  if (f.memo && f.memo.trim()) {
    const memo = f.memo.trim();
    const memoTrimmed = memo.length > 40 ? memo.slice(0, 39) + "…" : memo;
    const endsWithPunc = /[。．.!！?？]$/.test(memoTrimmed);
    const memoSentence = endsWithPunc ? memoTrimmed : `${memoTrimmed}。`;
    parts.push(`補足として、${memoSentence}`);
  }

  const summary = parts.join("");

  // 何も情報がないときの保険
  if (!summary) {
    return "本日の支援について特記すべき点はありません。";
  }

  return summary;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return err("Method not allowed", 405);
  }

  // --- Body JSON をパース ---
  let body: RequestPayload | null = null;
  try {
    body = await req.json();
  } catch (_) {
    return err("Invalid JSON body", 400);
  }

  if (!body || typeof body !== "object") {
    return err("Invalid payload", 400);
  }

  const { stepId, answer, current } = body;

  if (!stepId || typeof stepId !== "string") {
    return err("stepId is required");
  }
  if (!answer || typeof answer !== "string") {
    return err("answer is required");
  }
  if (!current || typeof current !== "object") {
    return err("current is required");
  }

  // --- OpenAI APIキー取得 ---
  const OPENAI_API_KEY =
    Deno.env.get("OPENAI_API_KEY") ?? Deno.env.get("OPENAI_KEY");

  if (!OPENAI_API_KEY) {
    return err("OPENAI_API_KEY is not configured", 500);
  }

  // 一時テスト: キーの長さ確認
  if (stepId === "diag-key") {
    return ok({ keyLength: OPENAI_API_KEY.length });
  }

  // --- Responses API 向け payload ---
  const payload = {
    model: MODEL,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: SYSTEM_PROMPT }],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `現在のステップ: ${stepId}\n` +
              `回答:\n${answer}\n\n` +
              `現在のフォーム(JSON):\n${buildUserPrompt({
                stepId,
                answer,
                current,
              })}`,
          },
        ],
      },
    ],
    // text.format は使わない（SYSTEM_PROMPT で JSON を強制）
    // JSON モードを使いたくなったら:
    // text: { format: { type: "json_object" } },
  };

  try {
    const aiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        // Responses API だけならこのヘッダは不要だが、付いていても害はない
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify(payload),
    });

    // OpenAI 側が 400/401 などを返したときは中身をそのまま返す
    if (!aiRes.ok) {
      const text = await aiRes.text();
      console.error("Failed to call OpenAI:", aiRes.status, text);

      return new Response(text, {
        status: aiRes.status,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    const aiResult = await aiRes.json();

    // 1. output_text があればそれを優先
    let textContent: string | null = null;
    if (
      typeof aiResult?.output_text === "string" &&
      aiResult.output_text.trim()
    ) {
      textContent = aiResult.output_text as string;
    } else {
      // 2. 念のため output 配列からも拾う（保険）
      const output = Array.isArray(aiResult?.output) ? aiResult.output : [];
      const message = output.find(
        (item: any) => item?.type === "message" && item?.role === "assistant",
      );
      const contents = Array.isArray(message?.content) ? message.content : [];
      const textItem = contents.find(
        (c: any) => c?.type === "output_text" || c?.type === "text",
      );
      if (textItem && typeof textItem.text === "string") {
        textContent = textItem.text;
      }
    }

    if (!textContent || typeof textContent !== "string") {
      return err("OpenAI response did not contain text", 502, {
        raw: aiResult,
      });
    }

    let parsed: ServiceNoteFields;
    try {
      parsed = JSON.parse(textContent) as ServiceNoteFields;
    } catch (parseError) {
      console.error("Failed to parse JSON from OpenAI:", textContent);
      return err("Failed to parse JSON from OpenAI response", 502, {
        raw: textContent,
        parseError: String(parseError),
      });
    }

    // 🔹ここで要約を生成（GPTは使わない）
    const summary = buildSummaryFromFields(parsed);

    const result: ServiceNoteResult = {
      fields: parsed,
      summary,
    };

    return ok(result);
  } catch (e) {
    console.error("Unexpected error calling OpenAI:", e);
    return err("Unexpected error", 500, { message: String(e) });
  }
});
