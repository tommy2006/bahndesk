param([string]$Dir)
Add-Type -AssemblyName System.Speech
$scenes = Get-Content -Raw -Encoding UTF8 (Join-Path $Dir 'scenes.json') | ConvertFrom-Json
foreach ($s in $scenes) {
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.SelectVoice('Microsoft Zira Desktop')
  $synth.Rate = 0
  $synth.SetOutputToWaveFile((Join-Path $Dir "$($s.id).wav"))
  $synth.Speak($s.text)
  $synth.Dispose()
}
