#!/bin/zsh

# Generate the function file and source it
PATHFUNCS_FILE="$(python3 $DOTFILES_DIR/src/python/pathfuncs.py)"
if [[ -f "$PATHFUNCS_FILE" ]]; then
  source "$PATHFUNCS_FILE"
else
  echo "Failed to generate path functions"
fi

# Source all sibling .sh files
SCRIPT_DIR="$(dirname "$0")"
for f in "$SCRIPT_DIR"/*.sh; do
  [[ "$f" == "$0" ]] && continue  # skip self
  [[ -f "$f" ]] && source "$f"
done


check_av_sync() {
  f="$1"

  # video duration (fallback to nb_frames/avg_frame_rate)
  vd=$(ffprobe -v error -select_streams v:0 \
       -show_entries stream=duration,nb_frames,avg_frame_rate \
       -of default=nk=1:nw=1 "$f" | awk '
         NR==1{vd=$1}
         NR==2{nf=$1}
         NR==3{split($1,a,"/"); afr=(a[2]>0?a[1]/a[2]:0)}
         END{
           if(vd=="" || vd=="N/A" || vd==0){
             if(nf!="" && afr>0){vd=nf/afr}
           }
           print vd
         }')

  # audio: try duration_ts*time_base, else plain duration
  read sr ats tb adur <<<"$(ffprobe -v error -select_streams a:0 \
    -show_entries stream=sample_rate,duration_ts,time_base,duration \
    -of default=nk=1:nw=1 "$f" | awk 'NR==1{sr=$1} NR==2{ats=$1} NR==3{tb=$1} NR==4{adur=$1} END{print sr,ats,tb,adur}')"

  # compute audio duration
  ad=0
  if [ -n "$ats" ] && [ "$ats" != "N/A" ] && [ -n "$tb" ] && [ "$tb" != "N/A" ]; then
    ad=$(awk -v ats="$ats" -v tb="$tb" 'BEGIN{split(tb,a,"/"); ad=ats*(a[1]/a[2]); print ad}')
  elif [ -n "$adur" ] && [ "$adur" != "N/A" ]; then
    ad="$adur"
  fi

  if [ -z "$sr" ] || [ -z "$vd" ] || [ "$sr" = "N/A" ]; then
    echo "[$f] missing required fields"
    return 1
  fi

  exp_samples=$(awk -v vd="$vd" -v sr="$sr" 'BEGIN{printf "%.0f", vd*sr}')
  act_samples=$(awk -v ad="$ad" -v sr="$sr" 'BEGIN{printf "%.0f", ad*sr}')
  drift_samples=$((act_samples - exp_samples))
  drift_ms=$(awk -v ds="$drift_samples" -v sr="$sr" 'BEGIN{print (ds*1000.0)/sr}')

  printf "%s\n" "file=$f"
  printf " video_duration=%.6f s\n" "$vd"
  printf " audio_duration=%.6f s\n" "$ad"
  printf " sample_rate=%s Hz\n" "$sr"
  printf " expected_samples=%s\n" "$exp_samples"
  printf " actual_samples=%s\n" "$act_samples"
  printf " drift=%s samples (%.3f ms)\n" "$drift_samples" "$drift_ms"

  awk -v dms="$drift_ms" 'BEGIN{exit (dms<5 && dms>-5)?0:1}' \
    && echo " ✅ audio rate aligns with video (|drift| < 5 ms)" \
    || echo " ⚠️ audio rate mismatch (|drift| ≥ 5 ms)"
}
