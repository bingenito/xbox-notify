const request = require("request");
const { DateTime, Duration } = require("luxon");

const auth = process.env.XBoxAPIAuthToken;
const slackChannelEndPoint = process.env.SlackEndPoint;
const channelOverride = process.env.SlackChannelOverride;
const tokenList = process.env.GamerTokenList;
const pollingInterval = process.env.PollingInterval || 15;
const retryLimit = process.env.RetryLimit || 2;

console.log("Auth: " + auth);
console.log("Slack: " + slackChannelEndPoint);
console.log("Channel: " + channelOverride);
console.log("Token List: " + tokenList);
console.log("Interval: " + pollingInterval);
console.log("=============================\n");

const checkInterval = pollingInterval * 60 * 1000;
let pollStart;

function main() {
  try {
    let delayMultiplier = 0;
    pollStart = DateTime.utc();
    console.log("Polling: " + pollStart.toString());
    tokenList.split(",").forEach(async token => {
      await sleep(delayMultiplier++ * 5000);
      processToken(token, 1);
    });
  } finally {
    setTimeout(main, checkInterval);
  }
}

function processToken(token, attempt) {
  const options = {
    url: `https://xboxapi.com/v2/${token}/activity`,
    headers: {
      "X-AUTH": auth,
      "Accept-Language": "en-US"
    }
  };

//  var fs = require("fs");
//  fs.readFile("test.json", "utf8", (error, body) => {
  request(options, (error, response, body) => {
//    console.log(body);
    if (error || response.statusCode != 200) {
      const retry = attempt + 1;
      if (retry <= retryLimit) {
        console.log("Retrying " + token);
        setTimeout(() => processToken(token, retry), 2000);
      } else {
        console.log(response.statusCode + " - " + token);
      }

      return;
    }

    const result = JSON.parse(body);
    if (!result.activityItems) {
      return;
    }

    result.activityItems
      .filter(item => item.activityItemType === "Achievement" || item.activityItemType === "GameDVR")
      .filter(item => DateTime.fromISO(item.activity.date) > pollStart.minus({minutes: pollingInterval}))
      .sort((a, b) => { new Date(b.activity.date) - new Date(a.activity.date) })
//      .slice(0, 5)
      .forEach(processItem);
  });
}

function processItem(item) {
  let message;

  switch (item.activityItemType) {
    case "Achievement":
      message = {
        attachments: [
          {
            fallback: `${item.gamertag}  unlocked an achievement`,
            title: `${item.gamertag} unlocked an achievement for ${item.gamerscore} gamerscore`,
            thumb_url: `${(item.activity ? item.activity.achievementIcon : '')}&format=png&w=128&h=128`,
            fields: [
              {
                title: `Title`,
                value: item.itemText
              },
              {
                title: `Description`,
                value: item.achievementDescription
              }
            ]
          }
        ]
      };
      break;

    case "GameDVR":
      message = {
        attachments: [
          {
            fallback: `${item.gamertag} ${item.shortDescription}`,
            title: `${item.gamertag} ${item.shortDescription}`,
            title_link: `http://xboxclips.com/${item.gamertag}/${item.clipId}`,
            thumb_url: `${item.clipThumbnail}&format=png&w=128&h=128`,
            fields: [
              {
                title: `Title`,
                value: item.itemText
              }
            ]
          }
        ]
      };
      break;
  }

  if (channelOverride) {
    message.channel = channelOverride;
  }

  sendSlackMessage(slackChannelEndPoint, JSON.stringify(message));
}

function sendSlackMessage(endPoint, message) {
  console.log(message);

  const options = {
    url: endPoint,
    headers: { 'content-type': "application/x-www-form-urlencoded" },
    body: message
  };
 
  request.post(options);
}

main();


async function sleep(millis) {
    return new Promise(resolve => setTimeout(resolve, millis));
}
