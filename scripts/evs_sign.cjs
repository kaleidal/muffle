const { execSync } = require('child_process')

let ran = false

module.exports = async function (context) {
  const { electronPlatformName, appOutDir } = context

  if (ran) return
  ran = true

  console.log('EVS: Signing with production VMP certificate...')

  try {
    if (electronPlatformName === 'darwin') {
      // macOS: sign BEFORE code-signing
      execSync(`py -m castlabs_evs.vmp sign-pkg "${appOutDir}"`, {
        stdio: 'inherit',
        env: { ...process.env, EVS_NO_ASK: '1' }
      })
    } else if (electronPlatformName === 'win32') {
      // Windows: sign AFTER code-signing (afterSign hook runs after)
      execSync(`py -m castlabs_evs.vmp sign-pkg "${appOutDir}"`, {
        stdio: 'inherit',
        env: { ...process.env, EVS_NO_ASK: '1' }
      })
    }
    console.log('EVS: Signing complete!')
  } catch (e) {
    console.error('EVS signing failed:', e.message)
    throw e
  }
}
