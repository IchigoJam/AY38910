import { AY38910 } from "./AY38910.js";

class AY38910AudioWorklet extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const clock = 1789772.5;
    this.psg = new AY38910(clock, sampleRate);

    this.port.onmessage = e => {
      this.psg.setRegister(e.data.addr, e.data.value);
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const len = output[0].length;

    for (let i = 0; i < len; i++) {
      const out = this.psg.getWave();
      for (let channel = 0; channel < output.length; channel++) {
        output[channel][i] = out;
      }
    }
    return true;
  }
}

registerProcessor("AY38910Node-processor", AY38910AudioWorklet);
