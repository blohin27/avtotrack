import * as dgram from 'dgram';
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import moment from 'moment-timezone';

dotenv.config();
const PORT = 4500;

const dbClient = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

dbClient.connect()
  .then(() => console.log('Подключено к PostgreSQL'))
  .catch((err) => console.error('Ошибка подключения к PostgreSQL:', err));

interface EGTSRawData {
  packetId: number;
  rawHex: string;
  rawText: string;
  timestamp: string;
}

const saveRawDataToDB = async (data: EGTSRawData) => {
  const query = `
    INSERT INTO gps_raw_data (packet_id, raw_text, raw_hex, timestamp)
    VALUES ($1, $2, $3, $4) 
  `;
  const values = [
    data.packetId,
    data.rawText,
    data.rawHex,
    data.timestamp,
  ];

  try {
    await dbClient.query(query, values);
    console.log('Сырые данные успешно сохранены в базу.');
  } catch (error) {
    console.error('Ошибка при записи данных в PostgreSQL:', error);
  }
};

const server = dgram.createSocket('udp4');

server.on('listening', () => {
  const address = server.address();
  console.log(`UDP сервер слушает ${address.address}:${address.port}`);
});

server.on('message', async (msg, rinfo) => {
  try {
    const packetId = msg.readUInt16LE(4) || 0; // Используем 0, если packetId не определен
    const timestamp = moment().tz('Europe/Moscow').format();

    await saveRawDataToDB({
      packetId,
      rawHex: msg.toString('hex'),
      rawText: '123',
      timestamp,
    });
  } catch (err) {
    console.error('Ошибка обработки UDP-пакета:', err);
  }
});

server.bind(PORT);

process.on('exit', () => {
  dbClient.end();
});
