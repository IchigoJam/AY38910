const BASE_URL = "https://ichigojam.github.io/AY38910";

export class AY38910Node extends AudioWorkletNode {
  static async create(context) {
    const base = location.host == "t.xgc.jp" ? "." : BASE_URL;
    const mpath = base + "/AY38910-processor.js";
    //console.log(mpath);
    await context.audioWorklet.addModule(mpath);
    return new AY38910Node(context);
  }
  constructor(context) {
    super(context, "AY38910Node-processor");
  }
  writeReg(addr, value) {
    this.port.postMessage({ addr: addr >> 0, value: value >> 0 });
  }
  writeRegs(regs) { // regs: Uint8Array(14)
    this.port.postMessage({ regs });
  }
};
