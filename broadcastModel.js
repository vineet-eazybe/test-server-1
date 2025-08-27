const mongoose = require("mongoose");

const broadcastSchema = new mongoose.Schema(
  {
    internal_user_id: { type: String, required: true },
    whatsapp_message_id: { type: String, default: null },
    eazybe_org_id: { type: String, required: true },

    facebook_business_manager_id: { type: String, default: "" },
    whatsapp_business_account_id: { type: String, default: "" },

    broadCastName: { type: String, required: true },
    campaign_id: { type: String, required: true },

    channel_id: { type: String, default: "team_inbox" },
    api_used: { type: String, default: "cloud" },

    event_timestamp: { type: Date, default: null },
    message_sent_timestamp: { type: Date, default: Date.now },

    message_direction: { type: String, enum: ["outgoing_api", "incoming_api"], default: "outgoing_api" },

    template_id: { type: String, required: true },
    recipient_phone_number: { type: String, required: true },

    dispatch_status_to_whatsapp: { type: String, enum: ["SENT_TO_BSP", "FAILED_TO_SEND"], required: true },
    delivery_status_from_whatsapp: { type: String, enum: ["sent", "delivered", "read", "failed", null], default: null },

    failure_reason_code: { type: String, default: "" },
    failure_reason_text: { type: String, default: "" },

    whatsapp_conversation_type: { type: String, enum: ["UTILITY", "MARKETING", "AUTHENTICATION"], default: "UTILITY" },

    cost_incurred_from_bsp_currency: { type: String, default: "" },
    cost_incurred_from_bsp_amount: { type: Number, default: null },

    user_charge_logic_version: { type: String, default: "v1" },
    amount_to_deduct_from_user_wallet_currency: { type: String, default: "" },
    amount_to_deduct_from_user_wallet_amount: { type: Number, required: true },

    user_wallet_deduction_id: { type: mongoose.Schema.Types.ObjectId, ref: "MediciJournal", default: null },
    user_wallet_deduction_status: { type: String, enum: ["DEDUCTION_SUCCESSFUL", "DEDUCTION_FAILED", "PAIDBACK"], required: true },

    total_broadcast_to_send: { type: Number, default: 1 },
    serial_of_broadcast: { type: Number, default: 1 },
  },
  { timestamps: true }
);

const Broadcast = mongoose.model("Broadcast", broadcastSchema);

module.exports = Broadcast;
