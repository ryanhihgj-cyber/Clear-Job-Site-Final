const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const { WebClient } = require("@slack/web-api");

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// 🔑 Environment variables in Render
const slackToken = process.env.SLACK_BOT_TOKEN;
const googleApiUrl = process.env.GOOGLE_API_URL; // from Apps Script
const web = new WebClient(slackToken);

// --- Slash Command Trigger ---
app.post("/slash", async (req, res) => {
  const { command, user_id, trigger_id } = req.body;

  if (command === "/clear") {
    try {
      // Fetch jobs + titles from Google Sheet
      const response = await axios.get(googleApiUrl);
      const data = response.data;

      const jobOptions = data.map(d => ({
        text: { type: "plain_text", text: d.Job },
        value: d.Job
      }));

      const titleOptions = data.map(d => ({
        text: { type: "plain_text", text: d.Title },
        value: d.Title
      }));

      // Open modal
      await web.views.open({
        trigger_id,
        view: {
          type: "modal",
          callback_id: "job_log_submit",
          title: { type: "plain_text", text: "Job Log" },
          submit: { type: "plain_text", text: "Submit" },
          blocks: [
            {
              type: "input",
              block_id: "job_block",
              label: { type: "plain_text", text: "Select Job" },
              element: {
                type: "static_select",
                action_id: "job_action",
                options: jobOptions
              }
            },
            {
              type: "input",
              block_id: "title_block",
              label: { type: "plain_text", text: "Select Title" },
              element: {
                type: "static_select",
                action_id: "title_action",
                options: titleOptions
              }
            },
            {
              type: "input",
              block_id: "notes_block",
              label: { type: "plain_text", text: "Notes" },
              element: {
                type: "plain_text_input",
                action_id: "notes_action",
                multiline: true
              }
            }
          ]
        }
      });

      return res.status(200).send();
    } catch (err) {
      console.error(err);
      return res.status(500).send("Error opening modal");
    }
  } else {
    res.status(200).send("Unknown command");
  }
});

// --- Modal Submit Handler ---
app.post("/interact", async (req, res) => {
  const payload = JSON.parse(req.body.payload);

  if (payload.type === "view_submission" && payload.view.callback_id === "job_log_submit") {
    const job = payload.view.state.values.job_block.job_action.selected_option.value;
    const title = payload.view.state.values.title_block.title_action.selected_option.value;
    const notes = payload.view.state.values.notes_block.notes_action.value;
    const user = payload.user.username;

    try {
      // Log to Google Sheet via Apps Script
      await axios.post(googleApiUrl, {
        job, title, notes, user, timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error logging to sheet", err);
    }

    return res.json({ response_action: "clear" });
  }

  res.status(200).send();
});

app.listen(3000, () => console.log("Server running on 3000"));
