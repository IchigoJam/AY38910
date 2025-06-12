// AY-3-8910 emulation
//
// 【動画あり】WebアプリケーションでPSGを再現するドライバ | Electronic Information Research Laboratory
// https://www.minagi.jp/2020/12/12/psgweb/
// 
// https://www.sfpgmr.net/dev/psg-emulator/
// https://www.g200kg.com/archives/2019/01/webaudio-api-au.html
// https://tech.pfq.jp/blog/1017/

// https://github.com/digital-sound-antiques/emu2149/blob/master/emu2149.h
// https://github.com/digital-sound-antiques/emu2149/blob/master/emu2149.c
export const AY38910 = function(clockFrequency, samplingRate) {
  const voltbl = [
    // AY-3-8910/8912 PROGRAMMABLE SOUND GENERATOR DATA MANUAL
    0, 2, 3, 4, 6, 8, 11, 16, 23, 32, 45, 64, 90, 128, 180, 255
  ];
  const scale = clockFrequency / 16 / samplingRate; // PSGの時間分解能と実行環境のサンプリングレートの比

  const registers = new Uint8Array([0b1010101, 0, 0, 0, 0, 0, 0, 0b10111000, 0, 0, 0, 0b1011, 0, 0]); // length == 14
  const ch_freq = [0, 0, 0]; // １周期のクロック数（周波数の逆数）
  let noise_freq = 0;
  const noises = [1, 1, 1];
  const tones = [0, 0, 0];
  const ch_volumes = [0, 0, 0];
  const ch_envelope = [0, 0, 0];

  // B7 B6 B5 B4 B3 B2 B1 B0
  //             |  |  |  |
  //             |  |  |  +-- hold
  //             |  |  +----- alternate
  //             |  +-------- attack
  //             +----------- continue
  let env_continue = 0; // 1:holdと同じ 0:1サイクルごとにカウンタを0にリセットする
  let env_attack = 0; // 0:hi→lo、1:lo→hi
  let env_alternate = 0; // 1:上下を交互に繰り返す
  let env_hold = 0; // 1:1サイクルのみで、最後の状態を維持
  // holdとalternateが両方1の場合、カウンタは初期状態に戻ってから維持される

  const counter = [0, 0, 0];
  let noise_counter = 0;
  let noise_value = 0;
  let noise_seed = 0xffff;
  let noise_scaler = 0;
  let env_freq = 0;
  let env_counter = 0;
  let env_direction = false;

  // 波形データ生成
  this.getWave = () => {
    let env_volume = 0;
    const output = [0, 0, 0];

    // エンベロープ
    env_counter -= scale * 16; // エンベロープカウンタのカウントダウン

    // 減分が1ではなくscale*16であるため、カウンタ値が0を下回る可能性があるため補正する
    if (env_counter < 0) env_counter = 0;

    // 1サイクルの16分のいくつか
    const env_step = (env_counter * 16 / env_freq) >> 0; // 15→0

    // E3 E2 E1 E0（音量値）の計算
    if (env_attack && env_direction || !env_attack && !env_direction) {
      env_volume = 15 - env_step; // 増加
    } else {
      env_volume = env_step; // 減衰
    }

    // 1サイクルが終了したときの処理
    if (env_counter == 0) {
      if (!env_continue || (env_continue && env_attack && env_alternate && env_hold)) { // 0xxx,1111 = 0〜7,15
        env_volume = 0;
      }
      if (env_continue && !env_attack && env_alternate && env_hold) { // 1011 = 11
        env_volume = 15;
      }
      if (env_continue && !env_hold) { // 1xx0 = 8,10,12,14
        env_counter = env_freq; // 繰り返すため、エンベロープカウンターを初期状態に戻す
      }
      if (env_continue && env_alternate && !env_hold) { // 1x10 = 10,14
        env_direction = !env_direction; // 増減を反転する
      }
    }

    // ノイズ
    noise_counter += scale;
    if (noise_counter >= noise_freq) {
      noise_scaler ^= 1;
      if (noise_scaler) {
        if (noise_seed & 1) {
          noise_seed ^= 0x24000;
        }
        noise_seed >>= 1;
      }
      if (noise_freq >= scale) {
        noise_counter -= noise_freq;
      } else {
        noise_counter = 0;
      }
    }
    noise_value = noise_seed & 1;

    // トーン
    for (let ch = 0; ch < 3; ch++) {
      //if (ch_freq[ch] != 0) {
      //if ((ch_freq[ch] != 0) && (tones[ch] == 0)) { // 1.0.1
      if ((ch_freq[ch] != 0) && (ch_freq[ch] != 4096) && (tones[ch] == 0)) { // 1.3.0 4096は究極のPSG演奏システムの「O9C」に対応
        if (counter[ch] % ch_freq[ch] > ch_freq[ch] / 2) {
          //((counter[ch] % ch_freq[ch]) > (ch_freq[ch] / 2)) && (tones[ch] == 0)
          // この「/ 2」が、デューティ比率1:1を表す
           // 1.0.1
          output[ch] += ch_envelope[ch] ? voltbl[env_volume] : voltbl[ch_volumes[ch]];
        } else {
          output[ch] -= ch_envelope[ch] ? voltbl[env_volume] : voltbl[ch_volumes[ch]];
        }
      }

      if (noises[ch] == 0 && ch_freq[ch] != 0) {
        if (noise_value) {
          output[ch] += ch_envelope[ch] ? voltbl[env_volume] : voltbl[ch_volumes[ch]];
        } else {
          output[ch] -= ch_envelope[ch] ? voltbl[env_volume] : voltbl[ch_volumes[ch]];
        }
      }

      counter[ch] -= scale;
      if (counter[ch] < 0) counter[ch] = ch_freq[ch];
    }

    return (output[0] + output[1] + output[2]) / 765; // 1〜-1に正規化
  };

  this.setRegister = (reg, value) => {
    registers[reg] = value;
    if (reg < 0) {
    } else if (reg <= 5) { // チャンネル周波数
      for (let ch = 0; ch < 3; ch++) {
        // 1.3.0 start
        //  究極のPSG演奏システムの「O9C」に対応させるため値を1ビット拡張
        //ch_freq[ch] = registers[ch * 2] + ((registers[ch * 2 + 1] & 15) << 8);
        ch_freq[ch] = registers[ch * 2] + ((registers[ch * 2 + 1] & 31) << 8);
        ch_freq[ch] = ch_freq[ch] > 4096 ? 4096 : ch_freq[ch];
        // 1.3.0 end
      }
    } else if (reg == 6) { // ノイズ周波数
      noise_freq = registers[reg] & 0b11111;
    } else if (reg == 7) { // チャンネル設定
      for (let ch = 0; ch < 3; ch++) {
        noises[ch] = (value >>> (ch + 3)) & 1;
        tones[ch] = (value >>> ch) & 1;
      }
    } else if (reg <= 10) { // チャンネル音量
      for (let ch = 0; ch < 3; ch++) {
        ch_volumes[ch] = registers[ch + 8] & 15;
        ch_envelope[ch] = (registers[ch + 8] >> 4) & 1;
      }
    } else if (reg <= 12) { // エンベロープ周期
      env_freq = (registers[11] << 8) + (registers[12] << 16);
    } else if (reg == 13) { // エンベロープ形状
      env_continue = (registers[13] >> 3) & 1;
      env_attack = (registers[13] >> 2) & 1;
      env_alternate = (registers[13] >> 1) & 1;
      env_hold = registers[13] & 1;
      env_freq = (registers[11] << 8) + (registers[12] << 16);
      env_counter = env_freq;
      env_direction = true;
    }
  };
  this.setRegisters = (regs) => {
    for (let i = 0; i < regs.length; i++) {
      if (registers[i] != regs[i]) {
        this.setRegister(i, regs[i]);
      }
    }
  };
};
