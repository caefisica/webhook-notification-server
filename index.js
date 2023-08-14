const express = require('express');
const axios = require('axios');
const { insertLog } = require('./database');

const app = express();
app.use(express.json());

const recipientNumber = getRequiredEnv('RECIPIENT_NUMBER') + '@s.whatsapp.net';
const VERIFY_TOKEN = getRequiredEnv('VERIFY_TOKEN');

const unsentPosts = [];
let retries = 0;

function getRequiredEnv(key) {
  const value = process.env[key];
  if (!value) {
      throw new Error(`La variable de entorno ${key} es requerida.`);
  }
  return value;
}

app.get('/facebook-posts', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
          console.log('WEBHOOK_VERIFIED');
          res.status(200).send(challenge);
      } else {
          res.sendStatus(403);
      }
  }
});

app.post('/facebook-posts', async (req, res) => {
  try {
      const text = buildTextFromPost(req.body);
      const response = await sendToWhatsAppBot(recipientNumber, text);

      if (response) {
          await insertLog('Notifications_Post', req.body, mapLogDataFunction);
          res.sendStatus(200);
      } else {
          addToRetryQueue(req.body);
          res.sendStatus(500);
      }
  } catch (error) {
      console.error('Error al enviar el mensaje al bot de WhatsApp:', error);
      addToRetryQueue(req.body);
      res.sendStatus(500);
  }
});

function addToRetryQueue(post) {
  unsentPosts.push(post);
  setRetryInterval();
}

function setRetryInterval() {
  if (retries < 5) {
      setTimeout(processRetryQueue, (retries + 1) * 10 * 1000);
  }
}

async function processRetryQueue() {
  for (const post of unsentPosts.slice()) {
      try {
          const response = await sendToWhatsAppBot(recipientNumber, buildTextFromPost(post));

          if (response) {
              await insertLog('Notifications_Post', post, mapLogDataFunction);
              unsentPosts.splice(unsentPosts.indexOf(post), 1);
          }
      } catch (error) {
          console.error('Error in retry:', error);
      }
  }
  retries++;
  setRetryInterval();
}

function buildTextFromPost(post) {
  const changes_detected = post.entry[0].changes[0];
  const post_id = changes_detected.value.post_id;
  const created_time = changes_detected.value.created_time;
  const message = changes_detected.value.message;
  const page_author = changes_detected.value.from.name;

  return `New post from ${page_author} at ${created_time}:\n\n${message}\n\nYou can view the post here: https://www.facebook.com/${post_id}`;
}

async function sendToWhatsAppBot(recipientNumber, text) {
  const response = await sendToWhatsAppManager(recipientNumber, text);
  if (response && response.status === 'sent') {
      return true;
  }
  return false;
}

async function sendToWhatsAppManager(recipientNumber, text) {
  try {
      const response = await axios.post('http://localhost:6000/send-message', { recipientNumber, text });
      return response.data;
  } catch (error) {
      return null;
  }
}

function mapLogDataFunction(logData) {
    return {
        post_id: logData.post_id,
        sender_number: logData.sender_number,
        recipient_number: logData.recipient_number,
        message_content: logData.message_content,
        status: 'sent',
        retry_count: retries,
        updated_at: new Date()
    };
}

app.listen(5000, () => {
    console.log('El servidor del webhook está ejecutándose en el puerto 5000.');
});
