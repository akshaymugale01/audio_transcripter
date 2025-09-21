class AudioStreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.bufferSize = 4096
    this.buffer = new Float32Array(this.bufferSize)
    this.bufferIndex = 0
    this.targetSampleRate = 16000 // AssemblyAI expects 16kHz
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]
    
    if (input.length > 0) {
      const inputData = input[0] // First channel
      const sourceSampleRate = sampleRate // AudioWorklet global
      
      // Add input data to buffer
      for (let i = 0; i < inputData.length; i++) {
        this.buffer[this.bufferIndex] = inputData[i]
        this.bufferIndex++
        
        if (this.bufferIndex >= this.bufferSize) {
          // Process the buffer
          this.processBuffer(sourceSampleRate)
          this.bufferIndex = 0
        }
      }
    }
    
    return true // Keep processor alive
  }
  
  processBuffer(sourceSampleRate) {
    let processedData = this.buffer
    
    // Resample to 16kHz if needed
    if (sourceSampleRate !== this.targetSampleRate) {
      const ratio = sourceSampleRate / this.targetSampleRate
      const newLength = Math.round(this.bufferSize / ratio)
      processedData = new Float32Array(newLength)
      
      for (let i = 0; i < newLength; i++) {
        const sourceIndex = Math.round(i * ratio)
        processedData[i] = this.buffer[Math.min(sourceIndex, this.bufferSize - 1)]
      }
    }
    
    // Convert Float32Array to Int16Array (16-bit PCM)
    const pcmData = new Int16Array(processedData.length)
    for (let i = 0; i < processedData.length; i++) {
      pcmData[i] = Math.max(-32768, Math.min(32767, processedData[i] * 32768))
    }
    
    // Send the processed audio data to the main thread
    this.port.postMessage(pcmData.buffer)
  }
}

registerProcessor('audio-stream-processor', AudioStreamProcessor)