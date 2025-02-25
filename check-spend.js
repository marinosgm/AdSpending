require("dotenv").config();
const axios = require("axios");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let BUSINESS_MANAGERS = [];
let lastSpend = {};
let currentlySpending = {};

// Fetch Business Managers
async function fetchBusinessManagers() {
    let businessManagers = [];
    
    const tokens = [
        process.env.FB_ACCESS_TOKEN, 
        process.env.FB_ACCESS_TOKEN_BM1
    ];

    for (const token of tokens) {
        try {
            const fbUrl = `https://graph.facebook.com/v22.0/me/businesses?fields=id,name&access_token=${token}`;
            const response = await axios.get(fbUrl);

            if (response.data.data.length > 0) {
                response.data.data.forEach(bm => {
                    businessManagers.push({
                        id: bm.id,
                        name: bm.name,
                        access_token: token
                    });
                });
            }
        } catch (error) {
            console.error(`❌ Error fetching Business Managers:`, error.response?.data || error.message);
        }
    }

    return businessManagers;
}

// Fetch Ad Accounts
async function getAdAccounts(bm) {
    try {
        const fbUrl = `https://graph.facebook.com/v22.0/${bm.id}/owned_ad_accounts?fields=id,name&access_token=${bm.access_token}`;
        const response = await axios.get(fbUrl);
        return response.data.data.map(acc => ({
            id: acc.id,
            name: acc.name,
            bm_name: bm.name
        }));
    } catch (error) {
        console.error(`❌ Error fetching ad accounts for ${bm.name}:`, error.response?.data || error.message);
        return [];
    }
}

// Check Spend for Today
async function checkAdSpend() {
    try {
        const today = new Date().toISOString().split("T")[0];

        for (const bm of BUSINESS_MANAGERS) {
            const adAccounts = await getAdAccounts(bm);

            for (const account of adAccounts) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1-second delay

                try {
                    const fbUrl = `https://graph.facebook.com/v22.0/${account.id}/insights?fields=spend&time_range={"since":"${today}","until":"${today}"}&access_token=${bm.access_token}`;
                    const fbResponse = await axios.get(fbUrl);

                    if (!fbResponse.data || !fbResponse.data.data || fbResponse.data.data.length === 0) {
                        console.log(`⚠️ No spend data available for ${account.name}, skipping.`);
                        continue;
                    }

                    const spend = parseFloat(fbResponse.data.data[0]?.spend || "0").toFixed(2);

                    console.log(`[${bm.name}] Ad Account ${account.name}: Today's Spend: $${spend}`);

                    if (!lastSpend[account.id]) lastSpend[account.id] = "0.00";
                    if (!currentlySpending[account.id]) currentlySpending[account.id] = false;

                    if (parseFloat(spend) > 0) {
                        if (!currentlySpending[account.id] || spend !== lastSpend[account.id]) {
                            const message = `🚀 Business Manager: *${bm.name}*\nAd Account: *${account.name}* started spending! 💰\nTotal Spend Today: $${spend}`;
                            const tgUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

                            await axios.post(tgUrl, {
                                chat_id: TELEGRAM_CHAT_ID,
                                text: message,
                                parse_mode: "Markdown"
                            });

                            console.log(`✅ Telegram Alert Sent for ${account.name}!`);
                            currentlySpending[account.id] = true;
                        }
                    } else {
                        currentlySpending[account.id] = false;
                    }

                    lastSpend[account.id] = spend;
                } catch (error) {
                    console.error(`❌ API Error for ${account.name}:`, error.response?.data || error.message);
                    continue;
                }
            }
        }
    } catch (error) {
        console.error("❌ Error Fetching Ad Spend:", error.response?.data || error.message);
    }
}

// Start Monitoring
async function initializeBusinessManagers() {
    BUSINESS_MANAGERS = await fetchBusinessManagers();
    console.log("✅ Business Managers Loaded:", BUSINESS_MANAGERS);
}

initializeBusinessManagers().then(() => {
    setInterval(checkAdSpend, 5 * 60 * 1000);
    checkAdSpend();
});