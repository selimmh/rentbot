const axios = require("axios");
const { JSDOM } = require("jsdom");
const fs = require("fs");
const TelegramBot = require("node-telegram-bot-api");
const CronJob = require("cron").CronJob;
const dotenv = require("dotenv");
dotenv.config();

const botToken = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const bot = new TelegramBot(botToken, { polling: true });
const BASE_URL = `https://www.olx.ro/imobiliare/apartamente-garsoniere-de-inchiriat/3-camere/suceava/?currency=EUR&search%5Border%5D=created_at%3Adesc&view=list&page=`;
const LISTINGS_FILE = "listings.json";

// 5987518865 selim chat id

bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  console.log(chatId);
  bot.sendMessage(chatId, "Received your message");
});

const sendTelegramMessageArray = async (listings) => {
  if (listings.length === 0) {
    console.log("🥹 No new listings found");
    await bot.sendMessage(CHAT_ID, "🥹 No new listings found");
    return;
  }

  console.log("😍 New listing(s) found: " + listings.length);
  await bot.sendMessage(CHAT_ID, "😍 New listing(s) found: " + listings.length);

  listings.forEach((listing) => {
    const parsedMessage = `Title: ${listing?.title}\nPrice: ${listing?.price}\n${listing?.link}`;

    console.log(parsedMessage);
    bot.sendMessage(CHAT_ID, parsedMessage);
  });
};

const fetchListingsPage = async () => {
  const data = await Promise.all([
    axios.get(BASE_URL + 1),
    axios.get(BASE_URL + 2),
  ]).then((res) => {
    return res.map((r) => r.data).join("");
  });
  return data;
};

const extractListings = (html) => {
  const dom = new JSDOM(html);
  const listings = dom.window.document.querySelectorAll('[data-cy="l-card"]');
  const listingsArray = Array.from(listings).map((listing) => {
    const title = listing.querySelector("h6").textContent;
    const linkRaw = listing.querySelector("a").href;
    const price = listing.querySelector('[data-testid="ad-price"]').textContent;

    const link = linkRaw.startsWith("https://www.storia.ro")
      ? linkRaw
      : "https://www.olx.ro" + linkRaw;

    return { title, price, link };
  });
  return [...new Set(listingsArray)];
};

const getNewListings = async () => {
  const html = await fetchListingsPage();
  const newListing = [];
  try {
    const oldListings = JSON.parse(await fs.promises.readFile(LISTINGS_FILE));
    const listings = extractListings(html);
    for (const listing of listings) {
      if (
        !oldListings.some((oldListing) => oldListing.title === listing.title)
      ) {
        newListing.push(listing);
      }
    }
    if (newListing.length) {
      await fs.promises.writeFile(LISTINGS_FILE, JSON.stringify(listings));
      console.log(`Saved ${listings.length} listings to ${LISTINGS_FILE}`);
    }
  } catch (error) {
    console.error(`Error reading or writing ${LISTINGS_FILE}:`, error);
  }
  return newListing;
};

let isInitialRun = true;

const main = async () => {
  job.start();
  try {
    // clear listings file on initial run
    const newListing = await getNewListings();

    if (isInitialRun) {
      bot.sendMessage(CHAT_ID, "🤖 Bot initialized");
      console.log("🤖 Bot initialized");

      isInitialRun = false;
    } else {
      sendTelegramMessageArray(newListing);
    }
  } catch (error) {
    bot.sendMessage(CHAT_ID, "Error fetching or processing listings");
    console.error("Error fetching or processing listings:", error);
  }
};

// every 20 seconds
const job = new CronJob(
  "*/05 * * * * *",
  function () {
    main();
  },
  null,
  true,
  "Europe/Bucharest"
);
