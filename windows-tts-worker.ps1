$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try { [System.Diagnostics.Process]::GetCurrentProcess().PriorityClass = 'BelowNormal' } catch {}

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

function Select-CarolVoice([string]$Gender) {
  $voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo })
  $preferred = @($voices | Where-Object { $_.Culture.Name -like 'pt-*' })
  if ($preferred.Count -eq 0) { $preferred = $voices }

  if ($Gender -ne 'auto') {
    $genderMatches = @($preferred | Where-Object { $_.Gender.ToString().ToLowerInvariant() -eq $Gender })
    if ($genderMatches.Count -gt 0) { $preferred = $genderMatches }
  }
  if ($preferred.Count -gt 0) { $synth.SelectVoice($preferred[0].Name) }
}

try {
  while (($line = [Console]::In.ReadLine()) -ne $null) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $job = $null
    try {
      $job = $line | ConvertFrom-Json
      $id = [string]$job.id
      $text = [string]$job.text
      $outputFile = [string]$job.outputFile
      $gender = ([string]$job.gender).ToLowerInvariant()
      if ($gender -notin @('auto','female','male')) { $gender = 'auto' }
      if ([string]::IsNullOrWhiteSpace($text)) { throw 'Texto vazio para TTS.' }
      if ([string]::IsNullOrWhiteSpace($outputFile)) { throw 'Arquivo de saída vazio.' }

      Select-CarolVoice $gender
      $synth.Rate = [Math]::Max(-10, [Math]::Min(10, [int]$job.rate))
      $synth.Volume = [Math]::Max(0, [Math]::Min(100, [int]$job.volume))
      $synth.SetOutputToWaveFile($outputFile)
      $synth.Speak($text)
      $synth.SetOutputToNull()

      $result = @{ id = $id; ok = $true; voiceName = $synth.Voice.Name }
    }
    catch {
      try { $synth.SetOutputToNull() } catch {}
      $id = if ($job -and $job.id) { [string]$job.id } else { '' }
      $result = @{ id = $id; ok = $false; error = $_.Exception.Message }
    }
    [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
    [Console]::Out.Flush()
  }
}
finally {
  $synth.Dispose()
}
