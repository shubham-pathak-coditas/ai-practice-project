import "dotenv/config";

import { OpenAI } from "openai";
import { setDefaultOpenAIClient, Agent, run, tool } from "@openai/agents";
import z from "zod";
import fs from "fs";
import { parse } from "csv-parse";
// import { createInterface } from "readline";
import { createInterface } from "node:readline";

const apiKey = process.env.API_KEY;

if (!apiKey) throw new Error("apikey not found");

setDefaultOpenAIClient(
  new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey }),
);

const readEmails = tool({
  name: "read email",
  description:
    "this tool is for read the email from inbox take filename from user",
  parameters: z.object({ fileName: z.string() }),
  async execute({ fileName }) {
    const readStream = fs.createReadStream(`./emails/${fileName}.txt`, {
      encoding: "utf8",
    });
    let content = "";
    try {
      for await (const chunk of readStream) {
        console.log("--- File chunk start ---");
        // console.log(chunk);
        console.log("--- File chunk end ---");
        content += chunk;
      }
      console.log("Finished reading the file.");
    } catch (error) {
      console.error(`Error reading file: ${error.message}`);
    }
    return content;
  },
});

const readOrders = tool({
  name: "read orders",
  description: "this tool is used to read orders",
  parameters: z.object({}),
  async execute() {
    const records: string[] = [];
    const parser = fs.createReadStream("orders.csv").pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
      }),
    );

    for await (const record of parser) {
      records.push(record);
    }

    return records;
  },
});

const agent = new Agent({
  name: "e-commerce agent",
  instructions: `you are smart e-commerce agent which is read the email using tool readEmails and classify the email categories there five category refund request, order status, product complaint, account/login issue, or other
         and then assign the priority to it from [high, medium, or low] for the order information you read order details from readOrders tool lookup the 'order_id' if user mentions in question or in email draft the email regarding email
         email should be polite.
         if email contains any absusive words like flag it and add reson as well
         ** Do not draft a reply if the email is vague, abusive, or refers to an order that doesn’t exist, or if the system isn’t confident in its classification. Flag the email for human review with a one-line reason**
         **Draft a polite reply that cites the customer’s actual order details. The reply must not promise a refund or a delivery date that the order data doesn’t support.**
         `,
  tools: [readEmails, readOrders],
  outputType: z.object({
    originalMail: z.string(),
    category: z.string(),
    priority: z.string(),
    isOrderFound: z.string(),
    draftReply: z.string(),
    isEscalated: z.boolean(),
    reason: z.string(),
    isAbusive: z.boolean(),
  }),
  model: "gpt-4.1-mini",
  modelSettings: { temperature: 0.2, topP: 0.9 },
});

const rl = createInterface({ input: process.stdin, output: process.stdout });
let isClosed = false;
rl.on("close", () => (isClosed = true));

rl.setPrompt("You:");
let text = rl.prompt();

for await (let line of rl) {
  let text = line.trim();
  if (text) {
    run(agent, text).then((res) => console.log(res.finalOutput));
  }
}

// run(agent, "i got the email_001").then((res) => console.log(res.finalOutput));
