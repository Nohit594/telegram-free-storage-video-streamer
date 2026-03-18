const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const getBotToken = () => process.env.TELEGRAM_BOT_TOKEN;
const getChatId = () => process.env.TELEGRAM_CHAT_ID;

exports.sendDocument = async (filePath) => {
    const token = getBotToken();
    const chatId = getChatId();

    if (!token || !chatId) {
        throw new Error('Telegram credentials missing in .env');
    }

    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('document', fs.createReadStream(filePath)); // Use document rather than video so Telegram doesn't try to process .ts chunks

    try {
        const response = await axios.post(`https://api.telegram.org/bot${token}/sendDocument`, form, {
            headers: {
                ...form.getHeaders()
            },
            maxBodyLength: Infinity 
        });

        if (response.data.ok) {
            // Return both file_id and message_id
            return {
                fileId: response.data.result.document.file_id,
                messageId: response.data.result.message_id
            };
        } else {
            throw new Error(`Telegram API Error: ${response.data.description}`);
        }
    } catch (error) {
        console.error('Error sending document to Telegram:', error.response?.data || error.message);
        throw error;
    }
};

exports.sendPhoto = async (filePath) => {
    const token = getBotToken();
    const chatId = getChatId();

    if (!token || !chatId) {
        throw new Error('Telegram credentials missing in .env');
    }

    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('photo', fs.createReadStream(filePath));

    try {
        const response = await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, form, {
            headers: {
                ...form.getHeaders()
            },
            maxBodyLength: Infinity 
        });

        if (response.data.ok) {
            // Photos are returned as an array of resolutions, pick the largest one (last in array)
            const photos = response.data.result.photo;
            return {
                fileId: photos[photos.length - 1].file_id,
                messageId: response.data.result.message_id
            };
        } else {
            throw new Error(`Telegram API Error: ${response.data.description}`);
        }
    } catch (error) {
        console.error('Error sending photo to Telegram:', error.response?.data || error.message);
        throw error;
    }
};

exports.getFileUrl = async (fileId) => {
    const token = getBotToken();

    try {
        const response = await axios.get(`https://api.telegram.org/bot${token}/getFile`, {
            params: { file_id: fileId }
        });

        if (response.data.ok) {
            const filePath = response.data.result.file_path;
            return {
                url: `https://api.telegram.org/file/bot${token}/${filePath}`,
                size: response.data.result.file_size
            };
        } else {
            throw new Error(`Telegram API Error: ${response.data.description}`);
        }
    } catch (error) {
        console.error('Error getting Telegram file path:', error.response?.data || error.message);
        throw error;
    }
};

exports.deleteFile = async (fileId) => {
    const token = getBotToken();

    try {
        // Note: Telegram doesn't provide a direct way to delete files from their servers
        // We can only delete the message containing the file from the chat
        // This removes visibility but the file might still exist on Telegram's servers temporarily
        
        // Try to delete the message (works within 48 hours of sending)
        const response = await axios.post(`https://api.telegram.org/bot${token}/deleteMessage`, {
            chat_id: getChatId(),
            message_id: parseInt(fileId)
        });

        if (response.data.ok) {
            console.log(`Message ${fileId} deleted from Telegram`);
            return true;
        } else {
            console.warn(`Could not delete message ${fileId}: ${response.data.description}`);
            return false;
        }
    } catch (error) {
        console.error('Error deleting message from Telegram:', error.response?.data || error.message);
        // Don't throw error - file might already be deleted or older than 48 hours
        return false;
    }
};
