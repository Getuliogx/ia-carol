param(
  [Parameter(Mandatory=$true)][string]$TextFile,
  [Parameter(Mandatory=$true)][string]$OutputFile,
  [ValidateSet('auto','female','male')][string]$Gender = 'auto',
  [int]$Rate = 0,
  [int]$Volume = 100
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

$text = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8)
if ([string]::IsNullOrWhiteSpace($text)) {
  throw 'Texto vazio para TTS.'
}

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $synth.Rate = [Math]::Max(-10, [Math]::Min(10, $Rate))
  $synth.Volume = [Math]::Max(0, [Math]::Min(100, $Volume))

  $voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo })
  $preferred = @($voices | Where-Object { $_.Culture.Name -like 'pt-*' })
  if ($preferred.Count -eq 0) { $preferred = $voices }

  if ($Gender -ne 'auto') {
    $genderMatches = @($preferred | Where-Object { $_.Gender.ToString().ToLowerInvariant() -eq $Gender })
    if ($genderMatches.Count -gt 0) { $preferred = $genderMatches }
  }

  if ($preferred.Count -gt 0) {
    $synth.SelectVoice($preferred[0].Name)
  }

  $synth.SetOutputToWaveFile($OutputFile)
  $synth.Speak($text)
  $synth.SetOutputToNull()
  Write-Output $synth.Voice.Name
}
finally {
  $synth.Dispose()
}
