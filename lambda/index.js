/*
Simple skill to connect Alexa with GPT-3 completions
*/

const Alexa = require("ask-sdk-core");
const got = require("got"); // for the https request to GPT-3
const Filter = require("bad-words"); // this is really optional, but filters out bad words
const APITIMEOUT = 6000; // Timeout to return a response if API call hangs

// These are the model and parameters I use in this example
// Other parameters are documented at https://beta.openai.com/docs/api-reference/completions
const GPT3MODEL = "ada"; // ada is the fastest and cheapest model of GPT-3.  See https://beta.openai.com/pricing
const GPT3MAXTOKENS = 75;
const GPT3TEMPERATURE = 0.7;
const GPT3FREQUENCYPENALTY = 0.5;

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest"
    );
  },
  handle(handlerInput) {
    const say = "Say the first line of a story.";
    var attributes = handlerInput.attributesManager.getSessionAttributes();
    attributes.completion = "";
    attributes.lastsentence = "";
    return handlerInput.responseBuilder.speak(say).reprompt(say).getResponse();
  },
};

/*
The UtteranceIntent model is based on https://stackoverflow.com/a/53334157
This handler handles both the UtteranceIntent (used to begin a story) and the ContinueIntent (which is used to request continuation of a story)
*/
const utteranceIntentHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;

    return (
      request.type === "IntentRequest" &&
      (request.intent.name === "UtteranceIntent" ||
        request.intent.name === "ContinueIntent")
    );
  },
  async handle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    var attributes = handlerInput.attributesManager.getSessionAttributes();
    if (!attributes.hasOwnProperty("completion")) attributes.completion = "";

    var say = "";
    var reSay = "";
    filter = new Filter({ placeHolder: "o" }); // this replaces a 'bad' word with a string of o's. Alexa says oooooooo!
    if (handlerInput.requestEnvelope.request.intent) {
      /*
        A new story utterance uses the text slot provided with the UtteranceIntent to feed GPT-3
        A ContinueIntent uses the previous GPT-3 completion as the prompt for GPT-3 (stored in attributes.completion), so the story will continue
      */
      if (request.intent.name === "UtteranceIntent") {
        var query =
          handlerInput.requestEnvelope.request.intent.slots.text.value;
      } else {
        var query = attributes.completion;
      }

      let data = "";

      // Add a failsafe timeout so the skill doesn't fail if the API call to GPT-3 times out
      // Code from here: https://levelup.gitconnected.com/promise-with-timeout-in-javascript-e42911ba23e1
      const fetchData = async (query) => {
        const { promiseOrTimeout, timeoutId } = promiseWithTimeout(
          getGPT3Results(query)
        );
        try {
          const result = await promiseOrTimeout;
          data = await result.toLowerCase();
        } catch (error) {
          console.log(error);
          data = "";
        } finally {
          clearTimeout(timeoutId);
        }
      };
      await fetchData(query);

      if (data != "") {
        // Alexa speech output chokes on special characters, so I eliminate all but alphanumeric and a few punctuations
        let cleanData = filter
          .clean(data)
          .replace(/[^a-z0-9\s\.\'\",?!:;+]+/gi, "");

        let cleanQuery = filter
          .clean(query)
          .replace(/[^a-z0-9\s\.\'\",?!:;+]+/gi, "");
        attributes.completion = cleanData;

        // I use a different voice to read the story (e.g. Joey) to differentiate it from Alexa's voice instructions
        if (request.intent.name === "UtteranceIntent") {
          say = "<voice name='Joey'>" + cleanQuery + "</voice>";
        } else {
          say = "<voice name='Joey'>" + attributes.lastsentence + "</voice>";
        }

        // Save the last "sentence" of the previous completion to start the response on a continued story
        attributes.lastsentence = cleanData
          .replace(/[\.?\"!…;]+/g, "###")
          .split("###");

        if (attributes.lastsentence.length > 0)
          attributes.lastsentence =
            attributes.lastsentence[attributes.lastsentence.length - 1];
        else attributes.lastsentence = " continuing. ";

        say +=
          "<voice name='Joey'>" +
          cleanData +
          ".</voice> Say, continue, to continue this story, or else begin a new one. ";
        reSay =
          "Say, continue, to continue this story, or else begin a new one.";
      } else {
        console.log("Timed out.");
        say = "Sorry, GPT-3 timed out. Please try again.";
        reSay = "Please try again.";
      }
      return handlerInput.responseBuilder
        .speak(say)
        .reprompt(reSay)
        .getResponse();
    }
  },
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.HelpIntent"
    );
  },
  handle(handlerInput) {
    const say =
      "Start a story with an opening line, and I will keep it going. At the end, you can begin a new story, or say, continue, to continue the one we started.";

    return handlerInput.responseBuilder.speak(say).reprompt(say).getResponse();
  },
};
const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      (Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "AMAZON.CancelIntent" ||
        Alexa.getIntentName(handlerInput.requestEnvelope) ===
          "AMAZON.StopIntent")
    );
  },
  handle(handlerInput) {
    const say = "Goodbye!";
    return handlerInput.responseBuilder.speak(say).getResponse();
  },
};
const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
      "SessionEndedRequest"
    );
  },
  handle(handlerInput) {
    // Any cleanup logic goes here.
    return handlerInput.responseBuilder.getResponse();
  },
};

// The intent reflector is used for interaction model testing and debugging.
// It will simply repeat the intent the user said. You can create custom handlers
// for your intents by defining them above, then also adding them to the request
// handler chain below.
const IntentReflectorHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest"
    );
  },
  handle(handlerInput) {
    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    const say = `You just triggered ${intentName}`;

    return (
      handlerInput.responseBuilder
        .speak(say)
        //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
        .getResponse()
    );
  },
};

// Generic error handling to capture any syntax or routing errors. If you receive an error
// stating the request handler chain is not found, you have not implemented a handler for
// the intent being invoked or included it in the skill builder below.
const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log(`~~~~ Error handled: ${error.stack}`);
    const say = `Sorry, I had trouble doing what you asked. Please try again.`;

    return handlerInput.responseBuilder.speak(say).reprompt(say).getResponse();
  },
};

// code based on https://www.twilio.com/blog/getting-started-with-openai-s-gpt-3-in-node-js
async function getGPT3Results(query) {
  const url = `https://api.openai.com/v1/engines/${GPT3MODEL}/completions`;
  const params = {
    prompt: query,
    max_tokens: GPT3MAXTOKENS,
    temperature: GPT3TEMPERATURE,
    frequency_penalty: GPT3FREQUENCYPENALTY,
  };
  const headers = {
    Authorization: `Bearer ${process.env.GPT3KEY}`,
  };
  var output;
  try {
    const response = await got
      .post(url, { json: params, headers: headers })
      .json();
    output = `${response.choices[0].text}`;
  } catch (err) {
    console.log(err);
  }
  return output;
}

// See: https://levelup.gitconnected.com/promise-with-timeout-in-javascript-e42911ba23e1
const promiseWithTimeout = (promise) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Request timed out"));
    }, APITIMEOUT);
  });
  return {
    promiseOrTimeout: Promise.race([promise, timeoutPromise]),
    timeoutId,
  };
};

// The SkillBuilder acts as the entry point for your skill, routing all request and response
// payloads to the handlers above. Make sure any new handlers or interceptors you've
// defined are included below. The order matters - they're processed top to bottom.
exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    utteranceIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler,
    IntentReflectorHandler // make sure IntentReflectorHandler is last so it doesn't override your custom intent handlers
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
