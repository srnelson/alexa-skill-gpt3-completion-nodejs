# Alexa GPT-3 Completion Skill Code

This is a simple Alexa skill written in node.js that connects with GPT-3. You can use these files to create a skill using the Alexa Skills Kit Command Line Interface (ask-cli) or in the Alexa Developer and AWS Lambda consoles.

Of the categories supported by GPT-3, I based my code on simple completion, as it requires no complex examples to train GPT-3 on more powerful completions. You could adapt this code with more complex prompt examples to explore other use cases of GPT-3. In my case, a simple "story-starting" prompt is all it takes.
See: https://beta.openai.com/docs/introduction/completion

You will need to provide your own GPT-3 key and store it in an evironment variable (GPT3KEY) accessible from your Lambda function: https://share.hsforms.com/1Lfc7WtPLRk2ppXhPjcYY-A4sk30
Note that access to a key for experimentation gives you a fixed amount of GPT-3 credits ($18 US) for a limited time period (three months). Additional use will require a subscription starting at $100 US per month. Credits are applied based on the tokenization of the input and output, and which GPT-3 model you are using. The default GPT-3 model for this skill is called "ada", which is the fastest and (by far) the cheapest model of GPT-3. You can set the model in a constant (GPT3MODEL), but be aware that the more expensive models (e.g. "davinci") can be up to 75x more expensive.

The skill uses three of the available parameters for GPT-3 completion. Other parameters are documented at: https://beta.openai.com/docs/api-reference/completions

User utterances are modeled as free-form input without any specific slots. The utterance intent is based on the method described here: https://stackoverflow.com/a/53334157

The method for calling GPT-3 from node.js is derived from: https://www.twilio.com/blog/getting-started-with-openai-s-gpt-3-in-node-js
For the https POST call to GPT-3, I use the "got" library: https://www.npmjs.com/package/got

I added a failsafe timeout mechanism so the skill doesn't fail if the API call to GPT-3 API times out. This is based on the code here: https://levelup.gitconnected.com/promise-with-timeout-in-javascript-e42911ba23e1

GPT-3 recommends (and I believe Alexa certification would require) filtering the output to remove offensive language. This skill code uses the bad-words filter: https://www.npmjs.com/package/bad-words

## Operation

There are two basic intents: UtteranceIntent and ContinueIntent (in addition to standard help and stop intents). Both UtteranceIntent and ContinueIntent are handled by the same handler. UtteranceIntent captures the free-form utterance and sends it to GPT-3, and responds with the utterance and the GPT-3 completion. The completion is stored in a session attribute. ContinueIntent requests that the story continue, and uses the previous completion session attribute to feed GPT-3. The response is formed by the last sentence of the previous completion followed by the new completion.
