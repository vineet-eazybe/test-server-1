// index.js
const functions = require('@google-cloud/functions-framework');
const axios = require("axios");
const { PubSub } = require('@google-cloud/pubsub');
const mongoose = require('mongoose');

// Import your custom modules
const Broadcast = require('./broadcastModel.js');
const ledgerService = require('./ledgerService.js');


// --- Configuration ---
const MONGODB_URI = 'mongodb+srv://eazybe-backend:2u14oH9wSlBdOBXz@chat-backup-us-central1.ryikyh.mongodb.net/eazy-be?retryWrites=true&w=majority&appName=chat-backup-us-central1';

const pubsub = new PubSub();
const pubSubTopic = pubsub.topic("interakt-webhook");

const discordWebhookUrls = [
    "https://discord.com/api/webhooks/1409778626605482047/17Y2aRc9CM1VG6NemIPhOWa8CPBxrfR37g-yTZAnMrt7YnW-KkxSoL9Fv3xyAmyGYkjn",
    "https://discord.com/api/webhooks/1409778808835412008/yb39zNtDSqiOostlMq7ihWy6XJkhxZYMGwGSjh-nG_k1lBBYlRpcVXkzSxXfv3jCgqCn",
    "https://discord.com/api/webhooks/1409778909402103888/xNtI-UvcD8C912nqeDSN6JGD5QryVEnZ8PbVOPPu6eJZsFu88Hw870m_J6wcQvQSxy9Y",
    "https://discord.com/api/webhooks/1409779003665158208/Muq8xLCG9HCVPPPGOnf--PrqqPnCmdTy3rK3oN884V3PTy66Q3tsmhjxywYPGT1uvT4z",
    "https://discord.com/api/webhooks/1409779118245019698/NNiHTvfn43wtDRgixpsUlYXmcwu4OXbov0aWBuKsquo06rvseCl5eJrs-Vs-jlE3pJ_G",
    "https://discord.com/api/webhooks/1409779651920007238/QrGXaiW564-ikvdZs_GWCm9xr9AAF176IDclCOAjeEIjwaL0OqdHdxGGG-t7gvhAoiwE",
    "https://discord.com/api/webhooks/1409779744475709490/u0pcQjNGXqpQAzjpGR8WerVlbN4LInln6VKHXDUmms66nnv62GspAi8OIVtCZwPNhAgQ",
    "https://discord.com/api/webhooks/1409779957269528607/JnsI_j3umfTAjFfMQY9h7MdvLFcY_5mAQSAOrRblj3PdFYVc47GAjf9epg9c2g5rJwHY"
  ];
  

// --- Global State ---
let connection = null; // Mongoose connection
let requestCount = 0; // Simple counter for requests

// --- Database Connection Function ---
const connectToDatabase = async () => {
    if (connection && mongoose.connection.readyState === 1) {
        console.log('Using existing database connection.');
        return;
    }
    console.log('Establishing new database connection...');
    connection = await mongoose.connect(MONGODB_URI);
    console.log('Database connected successfully!');
};

// --- Retry Utility with Exponential Backoff + Jitter ---
const retryWithBackoff = async (fn, {
  maxRetries = 5,
  initialDelayMs = 500,
  factor = 2,
  jitter = true
} = {}) => {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      return await fn(); // Try operation
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) {
        console.error(`Max retries reached. Failing... Error: ${err.message}`);
        sendDiscordMessage("DATABASE FINDING ERROR", "Max retries reached. Failing... Error: " + err.message);
        throw err;
      }
      // Exponential backoff + jitter
      let backoffDelay = initialDelayMs * Math.pow(factor, attempt);
      if (jitter) {
        backoffDelay = backoffDelay / 2 + Math.random() * (backoffDelay / 2);
      }
      console.warn(`Retry attempt ${attempt} after ${Math.round(backoffDelay)}ms due to error: ${err.message}`);
      await new Promise(res => setTimeout(res, backoffDelay));
    }
  }
};

// --- Helper Functions ---
const sendDiscordMessage = async (title = "Webhook Event", formattedMessage) => {
    try {
        const randomIndex = Math.floor(Math.random() * discordWebhookUrls.length);
        const webhookUrl = discordWebhookUrls[randomIndex];
        const finalMessage = "```" + formattedMessage + "```";
        await axios.post(webhookUrl, { content: finalMessage, username: title });
    } catch (error) {
        console.error("Error sending Discord message:", error.message);
    }
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// --- Core Logic for Broadcasts ---
const captureBroadcastResult = async (data) => {
    console.log('Starting captureBroadcastResult...');
    try {
        if (data?.object !== "whatsapp_business_account") {
            throw new Error("This event only captures whatsapp_business_account event");
        }

        const statusUpdate = data.entry?.[0]?.changes?.[0]?.value?.statuses?.[0];
        if (!statusUpdate?.id || !statusUpdate?.status) {
            throw new Error("Payload format issue: Missing status or message ID.");
        }

        const whatsapp_message_id = statusUpdate.id;
        let savedBroadcastInfo = null;

        // Retry with exponential backoff on findOne
        savedBroadcastInfo = await retryWithBackoff(() =>
            Broadcast.findOne({ whatsapp_message_id: whatsapp_message_id })
        );

        console.log(`Found broadcast info: ${!!savedBroadcastInfo}`);
        sendDiscordMessage("BROADCAST FINDING", `Found broadcast info: ${!!savedBroadcastInfo}`);

        if (!savedBroadcastInfo) {
            sendDiscordMessage("BROADCAST FINDING", `whatsapp_message_id [${whatsapp_message_id}] not found.`);
            throw new Error(`whatsapp_message_id [${whatsapp_message_id}] not found.`);
        }
        if (savedBroadcastInfo.user_wallet_deduction_status === "PAIDBACK") {
            sendDiscordMessage("BROADCAST FINDING", "Deduction already paid back for this broadcast.");
            throw new Error("Deduction already paid back for this broadcast.");
        }

        const updateRawMetaWebhookResponse = await Broadcast.updateOne(
            { whatsapp_message_id: whatsapp_message_id },
            { $set: { raw_meta_webhook_response: JSON.stringify(data) } }
        );

        sendDiscordMessage("BROADCAST FINDING", `Updating raw_meta_webhook_response... ${JSON.stringify(updateRawMetaWebhookResponse)}`);
        const updateData = {
            event_timestamp: statusUpdate.timestamp,
            delivery_status_from_whatsapp: statusUpdate.status,
        };

        if (updateData.delivery_status_from_whatsapp === "failed") {
            sendDiscordMessage("BROADCAST FINDING", "Message failed. Processing payback...");
            console.log('Message failed. Processing payback...');
            const paybackStatus = await ledgerService.paybackCreditsInWallet(
                savedBroadcastInfo.internal_user_id,
                savedBroadcastInfo.eazybe_org_id,
                savedBroadcastInfo.amount_to_deduct_from_user_wallet_amount,
                savedBroadcastInfo.amount_to_deduct_from_user_wallet_currency
            );

            updateData.failure_reason_code = statusUpdate.errors?.[0]?.code;
            updateData.failure_reason_text = statusUpdate.errors?.[0]?.message;

            if (paybackStatus) {
                updateData.user_wallet_deduction_status = "PAIDBACK";
                updateData.amount_to_deduct_from_user_wallet_amount = 0;
                console.log('Payback successful. Marked as PAIDBACK.');
                sendDiscordMessage("BROADCAST FINDING", "Payback successful. Marked as PAIDBACK.");
            }
        }

        const updateResult = await Broadcast.updateOne({ whatsapp_message_id: whatsapp_message_id }, { $set: updateData });
        console.log(`Update result for ${whatsapp_message_id}:`, updateResult);
        sendDiscordMessage("BROADCAST FINDING", `Update result for ${whatsapp_message_id}: ${JSON.stringify(updateResult)}, status: ${updateData.delivery_status_from_whatsapp}`);
    } catch (error) {
        console.error(`Error in captureBroadcastResult for payload: ${JSON.stringify(data)}`);
        console.error(`Error: ${error.message}`);
        sendDiscordMessage("BROADCAST FINDING", `Error in captureBroadcastResult for payload: ${JSON.stringify(data)}`);
        sendDiscordMessage("BROADCAST FINDING", `Error: ${error.message}`);
    }
};

// --- Main HTTP Function ---
functions.http('webhookReceiver', async (req, res) => {
    if (req.method === "GET" && req.query['hub.mode'] === 'subscribe') {
        console.log("Received verification request.");
        return res.status(200).send(req.query['hub.challenge']);
    }

    if (req.method === "POST") {
        requestCount++;
        console.log(`Processing request #${requestCount}`);

        const payload = req.body;
        
        // Respond immediately
        res.status(200).send("OK");

        try {
            const messageBuffer = Buffer.from(JSON.stringify(payload));
            const messageId = await pubSubTopic.publish(messageBuffer);
            console.log(`Message ${messageId} published to Pub/Sub.`);
        } catch (error) {
            console.error("PubSub publish error:", error);
        }

        await sendDiscordMessage("META WHATSAPP WEBHOOK", JSON.stringify(payload, null, 2));

        if (payload?.event === "WABA_ONBOARDED") {
            console.log("WABA_ONBOARDED event received. Notifying Eazybe API.");
            try {
                await axios.post("https://api.eazybe.com/v2/waba/update-partner-status", payload, {
                    headers: { "Content-Type": "application/json", "private-key": "123456789" },
                });
                console.log("Successfully notified Eazybe API for WABA_ONBOARDED.");
            } catch (err) {
                console.error("Error notifying Eazybe API:", err.response?.data || err.message);
            }
        }

        if (payload?.object === "whatsapp_business_account") {
            await connectToDatabase();
            await captureBroadcastResult(payload);

            console.log("Notifying Eazybe API for 24-hour window.");
            try {
                await axios.post("https://api.eazybe.com/v2/broadcast/capture-webhook-for-24-hour-window", payload, {
                    headers: { "Content-Type": "application/json", "private-key": "123456789" },
                });
                console.log("Successfully notified Eazybe API for 24-hour window.");
            } catch (err) {
                console.error("Error in 24-hour window call:", err.response?.data || err.message);
            }
        }
        return;
    }

    res.status(405).send("Method Not Allowed");
});
