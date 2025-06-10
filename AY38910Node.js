export class AY38910Node extends AudioWorkletNode {
  static async create(context) {
    await context.audioWorklet.addModule("./AY38910-processor.js");
    return new AY38910Node(context);
  }
  constructor(context) {
    super(context, "AY38910Node-processor");
  }
  writeReg(addr, value) {
    this.port.postMessage({ addr, value });
  }
};
