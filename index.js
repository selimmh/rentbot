import axios from "axios";
import fs from "fs";
import dotenv from "dotenv";

import TelegramBot from "node-telegram-bot-api";
import { JSDOM } from "jsdom";
import { CronJob } from "cron";

dotenv.config();

const BASE_URL = `https://www.olx.ro/imobiliare/apartamente-garsoniere-de-inchiriat/3-camere/suceava/?currency=EUR&search%5Border%5D=created_at%3Adesc&view=list&page=`;
const botToken = process.env.BOT_TOKEN;
const bot = new TelegramBot(botToken, { polling: true });
const LISTINGS_FILE = "listings.json";
const chatIds = [];

bot.onText(/\/init/, (msg) => {
  const chatId = msg.chat.id;

  if (!chatIds.includes(chatId)) {
    chatIds.push(chatId);
  }

  bot.sendMessage(chatId, "🤖 Bot initialized");
});

bot.onText(/\/stop/, (msg) => {
  const chatId = msg.chat.id;
  const index = chatIds.indexOf(chatId);
  if (index > -1) {
    chatIds.splice(index, 1);
  }
  bot.sendMessage(chatId, "Bor daway");
});

bot.onText(/\/list/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, JSON.stringify(chatIds));
});

const job = new CronJob(
  // "0 */1 * * *", // every hour
  "*/5 * * * * *", // every 5 seconds

  function () {
    main();
  },
  null,
  true,
  "Europe/Bucharest"
);

const logger = async (msg) => {
  if (!chatIds.length) return;

  console.log(msg);
  chatIds?.forEach((chatid) => {
    bot.sendMessage(chatid, msg);
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
    const newListing = await getNewListings();

    if (isInitialRun) {
      logger("🤖 Bot initialized");
      isInitialRun = false;
      return;
    }

    if (newListing.length === 0) {
      await logger("😢 No new listings found");
      return;
    }

    if (newListing.length) {
      await logger("😍 New listing(s) found: " + newListing.length);

      newListing.forEach((listing) => {
        const parsedMessage = `Title: ${listing?.title}\nPrice: ${listing?.price}\n${listing?.link}`;
        logger(parsedMessage);
      });
      return;
    }
  } catch (error) {
    logger("Error fetching or processing listings");
  }
};
