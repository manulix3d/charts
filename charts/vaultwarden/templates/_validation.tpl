{{- define "vaultwarden.validateStorage" }}
{{- $extData := "" }}
{{- $extAttach := "" }}
{{- if .Values.storage.existingVolumeClaim }}
  {{- if .Values.storage.existingVolumeClaim.data }}
    {{- $extData = .Values.storage.existingVolumeClaim.data.claimName | default "" }}
  {{- end }}
  {{- if .Values.storage.existingVolumeClaim.attachments }}
    {{- $extAttach = .Values.storage.existingVolumeClaim.attachments.claimName | default "" }}
  {{- end }}
{{- end }}
{{- $statefulData := .Values.storage.data }}
{{- $statefulAttach := .Values.storage.attachments }}

{{- if and $extAttach (not $extData) }}
  {{- fail "\n\n❌ CONFIGURATION ERROR:\n   attachments external PVC requires data external PVC!\n\n" }}
{{- end }}

{{- if and $extData $statefulAttach }}
  {{- fail "\n\n❌ CONFIGURATION ERROR:\n   Cannot mix external data PVC with StatefulSet attachments!\n\n" }}
{{- end }}

{{- if and $statefulData $extAttach }}
  {{- fail "\n\n❌ CONFIGURATION ERROR:\n   Cannot mix StatefulSet data with external attachments PVC!\n\n" }}
{{- end }}

{{- if and (not $extData) (not $extAttach) (not $statefulData) (not $statefulAttach) }}
  {{- fail "\n\n❌ CONFIGURATION ERROR:\n   No storage configured!\n\n" }}
{{- end }}

{{- end }}
