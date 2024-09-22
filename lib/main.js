import { createApp } from 'https://unpkg.com/petite-vue?module'
createApp({
  // Variables
  start: '0:00:00.00',
  end: '0:00:01.00',
  initialLayer: 0,
  style: 'Default',
  actor: 'Sign',
  output: '',
  clickWillCopy: true,
  addPosTag: true,
  
  // Methods
  async convert () {
    const data = await new Promise(resolve => {
      const messageListener = event => {
        window.removeEventListener('message', messageListener)  
        resolve(new TextDecoder().decode(event.data))
      }
      window.addEventListener('message', messageListener)
      parent.postMessage('app.activeDocument.saveToOE("svg:false,false,true")', '*')
    })
    const result = await runProgram(data, {
      startTime: this.start,
      endTime: this.end,
      initialLayer: this.initialLayer,
      style: this.style,
      actor: this.actor,
      addPosTag: this.addPosTag
    })
    this.output = result
    this.clickWillCopy = true
  },
  handleCopy (evt) {
    if (!this.clickWillCopy) return
    evt.preventDefault()
    this.clickWillCopy = false
    const el = evt.target
    el.selectionStart = 0
    el.selectionEnd = el.value.length
    document.execCommand('copy')
  }
}).mount('#app')

const getSettings = (precision, svgo) => {
  const extraSettings = [
    {
      name: 'convertPathData',
      active: precision !== -1,
      params: {
        applyTransforms: true,
        applyTransformsStroked: true,
        makeArcs: {
          threshold: 2.5,
          tolerance: 0.5
        },
        straightCurves: true,
        lineShorthands: true,
        // Needs to be disabled
        curveSmoothShorthands: false,
        floatPrecision: precision,
        transformPrecision: 5,
        removeUseless: true,
        collapseRepeated: true,
        utilizeAbsolute: true,
        leadingZero: true,
        negativeExtraSpace: true,
        noSpaceAfterFlags: false,
        forceAbsolutePath: false
      }
    },
    {
      name: 'cleanupNumericValues',
      active: precision !== -1,
      params: { floatPrecision: precision }
    },
    {
      name: 'cleanupListOfValues',
      active: precision !== -1,
      params: { floatPrecision: precision }
    },
    // Required for compatibility
    { name: 'convertStyleToAttrs', active: true },
    { name: 'inlineStyles', active: true, params: { onlyMatchedOnce: false } },
    { name: 'convertColors', active: false },
    { name: 'minifyStyles', active: false }
  ]
  if (precision === -1) {
    // Disable all default settings except by those required for compatibility
    return svgo.extendDefaultPlugins([
      ...svgo.extendDefaultPlugins([]).map(e => ({ ...e, active: false })),
      ...extraSettings
    ])
  }
  return svgo.extendDefaultPlugins(extraSettings)
}

const svgoSettings = [
  // Just compatibility settings
  -1,
  // Small compression
  3,
  // Medium compression
  1,
  // Strong compression
  0
]

async function runProgram (data, opt) {
  const {
    svgoLevel = 1,
    startTime,
    endTime,
    initialLayer,
    style,
    actor,
    addPosTag
  } = opt

  if (svgoLevel) {
    const svgo = await import('./svgo.browser.js')
    const settings = {
      plugins: getSettings(svgoSettings[svgoLevel - 1], svgo)
    }
    const result = svgo.optimize(data, settings)
    // Only replace data if svgo returns something
    if (result.data) data = result.data
  }
  
  return new Promise(resolve => {
  const worker = new window.Worker('lib/worker.js')
    const messageHandler = evt => {
      const data = evt.data
      if (data.status === 0) {
        let data = evt.data.stdout.join('\r\n')        
        if (addPosTag) {
          data = data.replaceAll(',,{', ',,{\\pos(0,0)')
        }
        resolve(data)
      } else {
        resolve(evt.data.stderr.join('\r\n'))
      }
      worker.removeEventListener('message', messageHandler)
    }
    worker.addEventListener('message', messageHandler)
    const argv = [
      '-L', initialLayer,
      '-S', startTime,
      '-E', endTime,
      '-A', actor,
      '-T', style
    ]
    worker.postMessage({ data, argv })
  })
}
