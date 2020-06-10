"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const amqplib_1 = require("amqplib");
const v4_1 = __importDefault(require("uuid/v4"));
class ServicesLib {
    constructor({ exchange, prefetch = 1 }) {
        //configurações de conexão com o servidor rabbitmq.
        this.connectUri = {
            protocol: process.env.RABBITMQ_PROTOCOL || undefined,
            hostname: process.env.RABBITMQ_HOST || undefined,
            port: process.env.RABBITMQ_PORT ? Number(process.env.RABBITMQ_PORT) : undefined,
            username: process.env.RABBITMQ_USER || undefined,
            password: process.env.RABBITMQ_PASS || undefined,
        };
        //configurações do certificado caso seja protocolo seguro no caso 'amqps'.
        this.connectOptions = this.connectUri.protocol == 'amqps' ? {
            ca: process.env.RABBITMQ_CERT ? [Buffer.from(process.env.RABBITMQ_CERT, 'base64')] : undefined,
        } : {};
        this.connection = null;
        this.channel = null;
        this.prefetch = 1;
        this.firstInit = true;
        this.defaultTimeOut = 30000;
        this.defaultTtl = 3600000;
        this.consumes = {};
        this._closed = false;
        this.exchange = exchange;
        this.prefetch = prefetch;
        this.init();
    }
    /**
     * Aguarda a quantidade de milisegundos para continuar as funções
     * @param ms
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Salva uma função consumidora para ser usada em caso de desconexão temporaria com o servidor rabbitmq.
     * @param queue
     * @param onMessage
     */
    saveConsume(queue, onMessage) {
        this.consumes[queue] = onMessage;
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                //Tenta se conectar cria um canal e uma exchange
                this.connection = yield amqplib_1.connect(this.connectUri, this.connectOptions);
                this.channel = yield this.connection.createChannel();
                yield this.channel.assertExchange(this.exchange, 'topic', {
                    durable: true,
                });
                //seta o numero de evento que as filas dessa conexão podem pegar
                yield this.channel.prefetch(this.prefetch);
                //so consome a fila caso não seja a primeira inicialização
                //caso não tenha isso ele cria 2 consumidores
                if (Object.keys(this.consumes).length > 0 && !this.firstInit)
                    for (let queue in this.consumes)
                        this.consumeQueue(queue, this.consumes[queue]);
                //define o serviço como já conectado uma vez
                this.firstInit = false;
                //log de conexão
                console.log('RABBITMQ Conectado.');
                if (!this._closed)
                    //Evento de desconexão
                    this.connection.on('close', () => {
                        //log de desconexão
                        console.log('Error RABBITMQ Desconectado.');
                        this.connection = null;
                        this.channel = null;
                        //tenta se reconectar depois de 1 segundo caso a conexão falhe
                        setTimeout(() => {
                            //log de tentativa
                            console.log('Tentando conectar ao RABBITMQ...');
                            this.init();
                        }, 1000);
                    });
            }
            catch (err) {
                console.log('Error ao tentar conectar no RABBITMQ.');
                this.connection = null;
                this.channel = null;
                //tenta se reconectar depois de 1 segundo caso a conexão falhe
                setTimeout(() => {
                    //log de tentativa
                    console.log('Tentando conectar ao RABBITMQ...');
                    this.init();
                }, 1000);
            }
        });
    }
    /**
     * Registra uma função para ficar consumindo uma fila.
     * @param queue
     * @param onMessage
     */
    consumeQueue(queue, onMessage) {
        return __awaiter(this, void 0, void 0, function* () {
            //salva o consumidor
            this.saveConsume(queue, onMessage);
            //caso o canal não exista ele tenta registrar o consumidor da fila depois de 1 segundo
            //para caso a conexão for estabelecida o consumidor seja registrado
            if (!this.channel) {
                console.log('Erro RABBITMQ canal não existe (consumeQueue) tentando novamente em 1 segundo...');
                yield this.sleep(1000);
                return this.consumeQueue(queue, onMessage);
            }
            try {
                //registra a fila no servidor caso não exista
                const q = yield this.channel.assertQueue(queue, { durable: true });
                //faz a ligação com a fila
                yield this.channel.bindQueue(q.queue, this.exchange, queue);
                //registra de fato o consumidor
                yield this.channel.consume(q.queue, onMessage);
            }
            catch (error) {
                console.log('Erro ao conectar na fila tentando novamente em 1 segundo...');
                //caso aconteça algum erro ele tenta registrar o consumidor da fila depois de 1 segundo
                yield this.sleep(1000);
                return this.consumeQueue(queue, onMessage);
            }
        });
    }
    /**
     * Consome fila de resposta baseado no replyTo
     * @param replyTo
     * @param timeOut
     */
    consumeQueueRPC(replyTo, timeOut) {
        return __awaiter(this, void 0, void 0, function* () {
            if (timeOut <= 0) {
                throw new Error('Time out...');
            }
            if (!this.channel) {
                console.log('Erro RABBITMQ canal não existe tentando novamente em 1 segundo...');
                yield this.sleep(1000);
                return this.consumeQueueRPC(replyTo, timeOut - 1000);
            }
            try {
                //registra a fila no servidor caso não exista
                const q = yield this.channel.assertQueue(replyTo, { durable: false, autoDelete: true, expires: 300000 });
                //faz a ligação com a fila
                yield this.channel.bindQueue(q.queue, this.exchange, replyTo);
                //consome a fila e retorna o json uma unica vez
                const response = yield this.channel.get(q.queue);
                //caso ainda não tenha nenhuma menssagem aguarda 100ms para tentar buscar de novo
                if (!response) {
                    yield this.sleep(100);
                    return this.consumeQueueRPC(replyTo, timeOut - 100);
                }
                //deleta a fila temporaria de maneira assincrona (sem um await)
                //pois nao necessariamente precisa que ela seja deletada já que existe um tempo de expiração
                this.channel.deleteQueue(q.queue).catch(() => {
                    console.log('Erro ao deletar fila temporaria.');
                });
                return response;
            }
            catch (error) {
                console.log('Erro ao conectar na fila tentando novamente em 1 segundo...');
                //caso aconteça algum erro ele tenta registrar o consumidor da fila depois de 1 segundo
                yield this.sleep(1000);
                return this.consumeQueueRPC(replyTo, timeOut - 1000);
            }
        });
    }
    /**
     * Retorna o JSON de uma mensagem.
     * @param msg
     */
    getJsonMessage(msg) {
        return JSON.parse(msg.content.toString());
    }
    /**
     * Retorna o Buffer de um JSON.
     * @param json
     */
    getBufferJson(json) {
        return Buffer.from(JSON.stringify(json));
    }
    /**
     * Aprova mensagem indicando que a ação dela ja foi concluida.
     * @param msg
     */
    aproveMessage(msg) {
        this.channel.ack(msg);
    }
    /**
     * Reenvia a mensagem para a fila para tentar processar ela novamente,
     * pode ser informado um delay que por padrão e de 5 minutos em milisegundos (300.000).
     * @param msg
     */
    reQueueMessage(msg, delay = 300000) {
        return __awaiter(this, void 0, void 0, function* () {
            this.rejectMessage(msg);
            yield this.sendToQueue({
                queue: msg.fields.routingKey,
                messageBuffer: msg.content,
                delay: delay,
            });
        });
    }
    /**
     * Rejeita a mensagem para que ela nem volte para a fila.
     * @param msg
     */
    rejectMessage(msg) {
        this.channel.nack(msg, null, false);
    }
    /**
     * Fecha a conexão com o servidor
     */
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            this._closed = true;
            yield this.connection.close();
        });
    }
    /**
     * Envia uma mensagem para uma fila especifica.
     * Pode ser informado um delay em milisegundos que por padrão e 0.
     * @param queue
     * @param message
     */
    sendToQueue(options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (options.awaitResponse && options.delay > 0) {
                throw new Error('Não pode ser definido delay em menssagens que aguardam resposta...');
            }
            //caso o canal não exista ele tenta registrar a mensagem na fila depois de 1 segundo
            //para caso a conexão for estabelecida a mensagem seja registrada
            if (!this.channel) {
                console.log('Erro RABBITMQ canal não existe (sendToQueue) tentando novamente em 1 segundo...');
                yield this.sleep(1000);
                return this.sendToQueue(options);
            }
            let queueName = options.queue;
            const queueOptions = {
                durable: true,
            };
            const optionsPub = {};
            if (options.delay && options.delay > 0) {
                optionsPub.expiration = options.delay;
                queueName = `${options.queue}.delay`;
                queueOptions.deadLetterExchange = this.exchange;
                queueOptions.deadLetterRoutingKey = options.queue;
                queueOptions.messageTtl = this.defaultTtl;
            }
            let awaitResponse;
            if (options.awaitResponse) {
                optionsPub.replyTo = v4_1.default();
                awaitResponse = this.consumeQueueRPC(optionsPub.replyTo, options.timeOut ? options.timeOut : this.defaultTimeOut);
            }
            if (options.extraData) {
                optionsPub.headers = {
                    extraData: options.extraData,
                };
            }
            try {
                //registra a fila no servidor caso não exista
                const q = yield this.channel.assertQueue(queueName, queueOptions);
                //faz a ligação com a fila
                yield this.channel.bindQueue(q.queue, this.exchange, queueName);
                //publica de fato a mensagem na fila, obrigatoriamente a mensagem deve ser enviada como um buffer
                yield this.channel.publish(this.exchange, queueName, options.messageBuffer, optionsPub);
            }
            catch (error) {
                console.log('Erro ao enviar para a fila tentando novamente em 1 segundo...');
                //caso aconteça algum erro ele tenta registrar a mensagem na fila depois de 1 segundo
                yield this.sleep(1000);
                return this.sendToQueue(options);
            }
            if (options.awaitResponse) {
                return yield awaitResponse;
            }
        });
    }
    sendToQueueRPC(replyTo, message) {
        return __awaiter(this, void 0, void 0, function* () {
            //caso o canal não exista ele tenta registrar a mensagem na fila depois de 1 segundo
            //para caso a conexão for estabelecida a mensagem seja registrada
            if (!this.channel) {
                console.log('Erro RABBITMQ canal não existe tentando novamente em 1 segundo...');
                yield this.sleep(1000);
                return this.sendToQueueRPC(replyTo, message);
            }
            try {
                //registra a fila no servidor caso não exista
                const q = yield this.channel.assertQueue(replyTo, { durable: false, autoDelete: true, expires: 300000 });
                //faz a ligação com a fila
                yield this.channel.bindQueue(q.queue, this.exchange, replyTo);
                //publica de fato a mensagem na fila, obrigatoriamente a mensagem deve ser enviada como um buffer
                yield this.channel.publish(this.exchange, replyTo, message);
            }
            catch (error) {
                console.log('Erro ao enviar para a fila tentando novamente em 1 segundo...');
                //caso aconteça algum erro ele tenta registrar a mensagem na fila depois de 1 segundo
                yield this.sleep(1000);
                return this.sendToQueueRPC(replyTo, message);
            }
        });
    }
}
exports.default = ServicesLib;
//# sourceMappingURL=index.js.map