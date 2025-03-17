import * as net from 'net';
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

const sendEGTSResponse = (socket: net.Socket, packetId: number) => {
  const response = Buffer.alloc(11);
  response.writeUInt8(0x01, 0); // Версия протокола EGTS
  response.writeUInt8(0x00, 1); // Security key ID
  response.writeUInt16LE(0x000b, 2); // Длина пакета
  response.writeUInt16LE(packetId, 4); // Packet ID
  response.writeUInt8(0x00, 6); // Тип ответа (EGTS_PT_RESPONSE)
  response.writeUInt8(0x00, 7); // Флаги пакета
  response.writeUInt8(0x00, 8); // Код результата обработки (успешно)
  response.writeUInt16LE(0x0000, 9); // CRC (упрощенно)

  socket.write(response);
  console.log(`Отправлено подтверждение для пакета ID: ${packetId}`);
};

const server = net.createServer((socket) => {
  console.log('Трекер подключен:', socket.remoteAddress);

  socket.on('data', async (data: Buffer) => {
    try {
      const packetId = data.readUInt16LE(4) || 0; // Если пакет ID не указан, то 0
      const timestamp = moment().tz('Europe/Moscow').format();

      console.log('Получены данные (hex):', data.toString('hex'));
      console.log('Получены данные (buffer):', data);

      // const rawText = data.toString('utf8'); // Используйте 'utf8' для текстовых данных

      await saveRawDataToDB({
        packetId,
        rawHex: data.toString('hex'),
        rawText:'123', // Сохраняем текстовое представление
        timestamp,
      });

      sendEGTSResponse(socket, packetId);
    } catch (err) {
      console.error('Ошибка обработки данных:', err);
    }
  });

  socket.on('end', () => {
    console.log('Трекер отключился:', socket.remoteAddress);
  });

  socket.on('error', (err) => {
    console.error('Ошибка соединения:', err);
  });
});

server.listen(PORT, () => {
  console.log(`Сервер запущен на ${PORT}`);
});

process.on('exit', () => {
  dbClient.end();
});
