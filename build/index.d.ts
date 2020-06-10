/// <reference types="node" />
import { ConsumeMessage } from 'amqplib';
interface SendToQueueInterface {
    queue: string;
    messageBuffer: Buffer;
    delay?: number;
    awaitResponse?: boolean;
    extraData?: string;
    timeOut?: number;
}
declare type onMessageType = (msg: ConsumeMessage) => any;
declare class ServicesLib {
    private connectUri;
    private connectOptions;
    private connection;
    private channel;
    private exchange;
    private prefetch;
    private firstInit;
    private defaultTimeOut;
    private defaultTtl;
    private consumes;
    private _closed;
    constructor({ exchange, prefetch }: {
        exchange: string;
        prefetch?: number;
    });
    /**
     * Aguarda a quantidade de milisegundos para continuar as funções
     * @param ms
     */
    sleep(ms: number): Promise<unknown>;
    /**
     * Salva uma função consumidora para ser usada em caso de desconexão temporaria com o servidor rabbitmq.
     * @param queue
     * @param onMessage
     */
    private saveConsume;
    private init;
    /**
     * Registra uma função para ficar consumindo uma fila.
     * @param queue
     * @param onMessage
     */
    consumeQueue(queue: string, onMessage: onMessageType): Promise<any>;
    /**
     * Consome fila de resposta baseado no replyTo
     * @param replyTo
     * @param timeOut
     */
    private consumeQueueRPC;
    /**
     * Retorna o JSON de uma mensagem.
     * @param msg
     */
    getJsonMessage(msg: ConsumeMessage): any;
    /**
     * Retorna o Buffer de um JSON.
     * @param json
     */
    getBufferJson(json: any): Buffer;
    /**
     * Aprova mensagem indicando que a ação dela ja foi concluida.
     * @param msg
     */
    aproveMessage(msg: ConsumeMessage): void;
    /**
     * Reenvia a mensagem para a fila para tentar processar ela novamente,
     * pode ser informado um delay que por padrão e de 5 minutos em milisegundos (300.000).
     * @param msg
     */
    reQueueMessage(msg: ConsumeMessage, delay?: number): Promise<void>;
    /**
     * Rejeita a mensagem para que ela nem volte para a fila.
     * @param msg
     */
    rejectMessage(msg: ConsumeMessage): void;
    /**
     * Fecha a conexão com o servidor
     */
    close(): Promise<void>;
    /**
     * Envia uma mensagem para uma fila especifica.
     * Pode ser informado um delay em milisegundos que por padrão e 0.
     * @param queue
     * @param message
     */
    sendToQueue(options: SendToQueueInterface): Promise<any>;
    sendToQueueRPC(replyTo: string, message: Buffer): Promise<any>;
}
export default ServicesLib;
