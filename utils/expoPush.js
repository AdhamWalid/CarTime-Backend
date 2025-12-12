// utils/expoPush.js
// Simple Expo push notification helper

// If you're on Node < 18, install node-fetch:
//   npm install node-fetch
// and then uncomment the require below:
//
// const fetch = require("node-fetch");

async function sendExpoPushNotification(expoPushToken, { title, body, data }) {
  try {
    if (!expoPushToken) return;
    if (!expoPushToken.startsWith("ExponentPushToken")) {
      console.log("Invalid Expo push token:", expoPushToken);
      return;
    }

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: expoPushToken,
        sound: "default",
        title,
        body,
        data: data || {},
      }),
    });

    const json = await res.json();
    if (!res.ok || json?.data?.status === "error") {
      console.log("Expo push error:", json);
    }
  } catch (err) {
    console.log("Expo push exception:", err);
  }
}

async function sendBulkExpoPush(tokens, payloadFn) {
  if (!Array.isArray(tokens)) return;
  for (const token of tokens) {
    const payload = typeof payloadFn === "function" ? payloadFn(token) : payloadFn;
    await sendExpoPushNotification(token, payload);
  }
}

module.exports = {
  sendExpoPushNotification,
  sendBulkExpoPush,
};