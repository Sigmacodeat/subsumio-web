#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  SUBSUMIO PIPELINE MONITOR — Live Dashboard                      ║
# ║  Zeigt alle laufenden Prozesse auf Laptop + Hetzner Server        ║
# ║  Usage:                                                           ║
# ║    ./scripts/monitor.sh              # Einmalige Ausgabe          ║
# ║    ./scripts/monitor.sh --watch      # Auto-Refresh alle 5s       ║
# ║    ./scripts/monitor.sh --watch 10   # Auto-Refresh alle 10s      ║
# ║    ./scripts/monitor.sh --logs       # + letzte Log-Zeilen         ║
# ║    ./scripts/monitor.sh --db         # + DB Stats                  ║
# ║    ./scripts/monitor.sh --all        # Alles (logs + db + disk)    ║
# ╚══════════════════════════════════════════════════════════════════╝

set -euo pipefail

SSH_HOST="subsumio-hetzner"
REFRESH_INTERVAL=5
SHOW_LOGS=false
SHOW_DB=false
SHOW_DISK=false
WATCH=false
KILL_ZOMBIES=false
DO_REBALANCE=false
SHOW_BALANCE=false

# ── Parse Args ──────────────────────────────────────────────────────
for arg in "$@"; do
  case $arg in
    --watch)    WATCH=true ;;
    --logs)     SHOW_LOGS=true ;;
    --db)       SHOW_DB=true ;;
    --disk)     SHOW_DISK=true ;;
    --all)      SHOW_LOGS=true; SHOW_DB=true; SHOW_DISK=true; SHOW_BALANCE=true ;;
    --kill-zombies) KILL_ZOMBIES=true ;;
    --rebalance) DO_REBALANCE=true ;;
    --balance) SHOW_BALANCE=true ;;
    --help|-h)  head -12 "$0" | tail -10; exit 0 ;;
    *)          if [[ "$arg" =~ ^[0-9]+$ ]]; then REFRESH_INTERVAL=$arg; fi ;;
  esac
done

# ── Colors ──────────────────────────────────────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RESET="\033[0m"
  C_BOLD="\033[1m"
  C_DIM="\033[2m"
  C_RED="\033[31m"
  C_GREEN="\033[32m"
  C_YELLOW="\033[33m"
  C_BLUE="\033[34m"
  C_MAGENTA="\033[35m"
  C_CYAN="\033[36m"
  C_WHITE="\033[37m"
  C_BG_RED="\033[41m"
  C_BG_GREEN="\033[42m"
  C_BG_YELLOW="\033[43m"
  C_BG_BLUE="\033[44m"
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_RED=""; C_GREEN=""; C_YELLOW=""
  C_BLUE=""; C_MAGENTA=""; C_CYAN=""; C_WHITE=""
  C_BG_RED=""; C_BG_GREEN=""; C_BG_YELLOW=""; C_BG_BLUE=""
fi

# ── Helpers ─────────────────────────────────────────────────────────
hr() {
  local width=${COLUMNS:-120}
  printf "${C_DIM}%${width}s${C_RESET}\n" "" | tr ' ' '─'
}

section() {
  echo ""
  printf "${C_BOLD}${C_CYAN}╔══ %s ══╗${C_RESET}\n" "$1"
}

bar() {
  # bar <percent> <width>
  local pct=$1 width=${2:-30}
  local filled=$(( pct * width / 100 ))
  local empty=$(( width - filled ))
  local color
  if (( pct >= 90 )); then color=$C_RED
  elif (( pct >= 70 )); then color=$C_YELLOW
  else color=$C_GREEN
  fi
  printf "${color}"; printf "█%.0s" $(seq 1 $filled 2>/dev/null) || true
  printf "${C_DIM}"; printf "░%.0s" $(seq 1 $empty 2>/dev/null) || true
  printf "${C_RESET}"
}

ssh_run() {
  ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$SSH_HOST" "$1" 2>/dev/null
}

# ── LOCAL: Laptop Processes ─────────────────────────────────────────
render_local() {
  section "💻 LAPTOP (macOS) — $(hostname)"

  # Next.js / Bun / Node processes related to subsumio
  echo ""
  printf "${C_BOLD}  Subsumio-relevante Prozesse:${C_RESET}\n"
  printf "${C_DIM}  %-7s %-6s %-5s %-5s %-8s %s${C_RESET}\n" "PID" "%CPU" "%MEM" "RSS" "TIME" "COMMAND"

  ps aux | grep -E 'bun |node.*next|node.*server\.mjs|npm.*dev|playwright.*cli|rsync|scp.*subsumio' \
    | grep -v grep \
    | grep -v 'Devin' \
    | grep -v 'Helper' \
    | grep -v 'node-ipc' \
    | grep -v 'languageServer' \
    | grep -v 'tsserver' \
    | grep -v 'typescript' \
    | grep -v 'dockerfile' \
    | grep -v 'json-language' \
    | grep -v 'html-language' \
    | grep -v 'mongodb' \
    | grep -v 'vscode' \
    | grep -v 'svelte' \
    | grep -v 'pyright' \
    | grep -v 'codeium' \
    | grep -v 'windsurf' \
    | grep -v 'Chrome' \
    | grep -v 'containermanagerd' \
    | grep -v 'mdbulkimport' \
    | grep -v 'mdworker' \
    | grep -v 'ctkahp' \
    | grep -v 'powerd' \
    | grep -v 'Google' \
    | while IFS= read -r line; do
      local pid=$(echo "$line" | awk '{print $2}')
      local cpu=$(echo "$line" | awk '{print $3}')
      local mem=$(echo "$line" | awk '{print $4}')
      local rss=$(echo "$line" | awk '{print $6}')
      local time=$(echo "$line" | awk '{print $10}')
      local cmd=$(echo "$line" | awk '{for(i=11;i<=NF;i++) printf "%s ", $i; print ""}' | sed 's/ $//')
      # Shorten command
      local short_cmd=$(echo "$cmd" | sed 's|/Users/msc/subsumio-web/||g; s|/Users/msc/.nvm/versions/node/[^/]*/bin/||g; s|/Applications/[^/]*/Contents/[^/]*/MacOS/||g')
      # RSS to MB
      local rss_mb=$(( rss / 1024 ))
      # Color by CPU
      local cpu_color=$C_GREEN
      if (( $(echo "$cpu > 50" | bc -l 2>/dev/null || echo 0) )); then cpu_color=$C_RED
      elif (( $(echo "$cpu > 20" | bc -l 2>/dev/null || echo 0) )); then cpu_color=$C_YELLOW
      fi
      # Truncate long commands
      local max_len=70
      if [ ${#short_cmd} -gt $max_len ]; then
        short_cmd="${short_cmd:0:$max_len}..."
      fi
      printf "  %-7s ${cpu_color}%-6s${C_RESET} %-5s %4sM %-8s ${C_DIM}%s${C_RESET}\n" \
        "$pid" "$cpu" "$mem" "$rss_mb" "$time" "$short_cmd"
    done

  # Local dev server check
  echo ""
  local port_3000=$(lsof -i :3000 -P 2>/dev/null | grep LISTEN | head -1)
  if [ -n "$port_3000" ]; then
    local pid_3000=$(echo "$port_3000" | awk '{print $2}')
    printf "  ${C_GREEN}●${C_RESET} Port 3000: PID %s (Next.js dev server aktiv)\n" "$pid_3000"
  else
    printf "  ${C_RED}○${C_RESET} Port 3000: nicht aktiv\n"
  fi

  # rsync / scp transfers
  echo ""
  printf "${C_BOLD}  Aktive Transfers (rsync/scp):${C_RESET}\n"
  local transfers=$(ps aux | grep -E 'rsync|^.*scp [^ ]' | grep -v grep | grep -v 'Devin' | grep -v 'appplaceholdersyncd' | grep -v 'placeholdersync')
  if [ -n "$transfers" ]; then
    echo "$transfers" | while IFS= read -r line; do
      local pid=$(echo "$line" | awk '{print $2}')
      local cmd=$(echo "$line" | awk '{for(i=11;i<=NF;i++) printf "%s ", $i; print ""}' | sed 's/ $//')
      printf "    ${C_MAGENTA}↔${C_RESET} PID %-7s %s\n" "$pid" "$cmd"
    done
  else
    printf "    ${C_DIM}keine aktiven Transfers${C_RESET}\n"
  fi

  # Local RAM/CPU summary
  local local_mem_total=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
  local local_mem_used=$(vm_stat 2>/dev/null | awk '/Pages active/ {sum+=$3} /Pages wired/ {sum+=$3} END {print sum*4096}' || echo 0)
  if [ "$local_mem_total" -gt 0 ] 2>/dev/null && [ "$local_mem_used" -gt 0 ] 2>/dev/null; then
    local lmem_pct=$(( local_mem_used * 100 / local_mem_total ))
    local lmem_total_gb=$(( local_mem_total / 1073741824 ))
    local lmem_used_gb=$(( local_mem_used / 1073741824 ))
    local lmem_color=$C_GREEN
    if [ "$lmem_pct" -gt 85 ] 2>/dev/null; then lmem_color=$C_RED
    elif [ "$lmem_pct" -gt 70 ] 2>/dev/null; then lmem_color=$C_YELLOW
    fi
    printf "  ${C_BOLD} RAM:${C_RESET} "; bar "$lmem_pct" 20; printf " ${lmem_color}%sGB / %sGB (%s%%)${C_RESET}\n" "$lmem_used_gb" "$lmem_total_gb" "$lmem_pct"
  fi
}

# ── HETZNER: Server Processes ───────────────────────────────────────
render_hetzner() {
  section "🖥  HETZNER (167.233.134.25)"

  # Docker containers
  echo ""
  printf "${C_BOLD}  Docker Container:${C_RESET}\n"
  printf "${C_DIM}  %-30s %-20s %s${C_RESET}\n" "NAME" "STATUS" "PORTS"

  local docker_ps=$(ssh_run 'docker ps -a --format "{{.Names}}|{{.Status}}|{{.Ports}}" 2>/dev/null' || echo "")
  if [ -n "$docker_ps" ]; then
    echo "$docker_ps" | while IFS='|' read -r name status ports; do
      local status_color=$C_GREEN
      if echo "$status" | grep -qi 'unhealthy'; then status_color=$C_RED
      elif echo "$status" | grep -qi 'restarting'; then status_color=$C_RED
      elif echo "$status" | grep -qi 'exited'; then status_color=$C_YELLOW
      elif echo "$status" | grep -qi 'Up'; then status_color=$C_GREEN
      fi
      # Clean up ports
      local short_ports=$(echo "$ports" | tr ',' '\n' | grep -oE '0\.0\.0\.0:[0-9]+' | head -3 | tr '\n' ' ' | sed 's/0\.0\.0\.0://g; s/ $//')
      [ -z "$short_ports" ] && short_ports="-"
      printf "  %-30s ${status_color}%-20s${C_RESET} %s\n" "$name" "$status" "$short_ports"
    done
  else
    printf "  ${C_DIM}Docker nicht verfügbar${C_RESET}\n"
  fi

  # Bun/Node processes
  echo ""
  printf "${C_BOLD}  Pipeline Prozesse (bun/node):${C_RESET}\n"
  printf "${C_DIM}  %-7s %-6s %-5s %-5s %-8s %s${C_RESET}\n" "PID" "%CPU" "%MEM" "RSS" "TIME" "COMMAND"

  local remote_ps=$(ssh_run 'ps aux --sort=-%cpu | grep -E "bun|node.*next|node.*cli" | grep -v grep | grep -v "ps aux" | head -20' || echo "")
  if [ -n "$remote_ps" ]; then
    echo "$remote_ps" | while IFS= read -r line; do
      local pid=$(echo "$line" | awk '{print $2}')
      local cpu=$(echo "$line" | awk '{print $3}')
      local mem=$(echo "$line" | awk '{print $4}')
      local rss=$(echo "$line" | awk '{print $6}')
      local time=$(echo "$line" | awk '{print $10}')
      local cmd=$(echo "$line" | awk '{for(i=11;i<=NF;i++) printf "%s ", $i; print ""}' | sed 's/ $//')
      local short_cmd=$(echo "$cmd" | sed 's|/app/||g; s|bun scripts/|scripts/|g; s|bun /app/scripts/|scripts/|g; s|node /app/||g; s|/usr/local/bin/||g')
      local rss_mb=$(( rss / 1024 ))
      local cpu_color=$C_GREEN
      if (( $(echo "$cpu > 50" | bc -l 2>/dev/null || echo 0) )); then cpu_color=$C_RED
      elif (( $(echo "$cpu > 20" | bc -l 2>/dev/null || echo 0) )); then cpu_color=$C_YELLOW
      fi
      # Mark defunct/zombie
      local stat=$(echo "$line" | awk '{print $8}')
      # Truncate long commands
      local max_len=65
      if [ ${#short_cmd} -gt $max_len ]; then
        short_cmd="${short_cmd:0:$max_len}..."
      fi
      if echo "$stat" | grep -q 'Z'; then
        printf "  %-7s ${C_RED}ZOMBIE ${C_RESET} %-5s %4sM %-8s ${C_RED}%s${C_RESET}\n" "$pid" "$mem" "$rss_mb" "$time" "$short_cmd"
      else
        printf "  %-7s ${cpu_color}%-6s${C_RESET} %-5s %4sM %-8s ${C_DIM}%s${C_RESET}\n" "$pid" "$cpu" "$mem" "$rss_mb" "$time" "$short_cmd"
      fi
    done
  else
    printf "  ${C_DIM}keine Prozesse${C_RESET}\n"
  fi

  # System resources
  echo ""
  printf "${C_BOLD}  System Ressourcen:${C_RESET}\n"

  local cpu_use=$(ssh_run 'top -bn1 | grep "Cpu(s)" | awk "{print \$2}" | head -1' 2>/dev/null | xargs || echo "0")
  local mem_info=$(ssh_run 'free -m | awk "/Mem:/{print \$2, \$3}"' 2>/dev/null | xargs || echo "0 0")
  local mem_total=$(echo "$mem_info" | awk '{print $1}')
  local mem_used=$(echo "$mem_info" | awk '{print $2}')
  local disk_info=$(ssh_run 'df -h / | awk "NR==2{print \$2, \$3, \$5}"' 2>/dev/null | xargs || echo "0 0 0%")
  local disk_total=$(echo "$disk_info" | awk '{print $1}')
  local disk_used=$(echo "$disk_info" | awk '{print $2}')
  local disk_pct=$(echo "$disk_info" | awk '{print $3}' | tr -d '%')
  local load_info=$(ssh_run 'cat /proc/loadavg' 2>/dev/null || echo "0 0 0")
  local load1=$(echo "$load_info" | awk '{print $1}')
  local load5=$(echo "$load_info" | awk '{print $2}')
  local load15=$(echo "$load_info" | awk '{print $3}')
  local cores=$(ssh_run 'nproc' 2>/dev/null | xargs || echo 4)

  # CPU
  local cpu_int=$(echo "$cpu_use" | cut -d. -f1 2>/dev/null || echo 0)
  [ -z "$cpu_int" ] && cpu_int=0
  printf "  CPU:     "; bar "$cpu_int" 25; printf " %s%%\n" "${cpu_use:-0}"

  # Memory
  if [ -n "$mem_total" ] && [ "$mem_total" -gt 0 ] 2>/dev/null; then
    local mem_pct=$(( mem_used * 100 / mem_total ))
    printf "  Memory:  "; bar "$mem_pct" 25; printf " %sM / %sM (%s%%)\n" "$mem_used" "$mem_total" "$mem_pct"
  else
    printf "  Memory:  ${C_DIM}nicht verfügbar${C_RESET}\n"
  fi

  # Disk
  [ -z "$disk_pct" ] && disk_pct=0
  printf "  Disk:    "; bar "$disk_pct" 25; printf " %s / %s (%s%%)\n" "$disk_used" "$disk_total" "$disk_pct"

  # Load
  local load_color=$C_GREEN
  if (( $(echo "$load1 > $cores" | bc -l 2>/dev/null || echo 0) )); then load_color=$C_RED
  elif (( $(echo "$load1 > $cores * 0.7" | bc -l 2>/dev/null || echo 0) )); then load_color=$C_YELLOW
  fi
  printf "  Load:    ${load_color}%s / %s / %s${C_RESET} (1/5/15 min, %s cores)\n" "$load1" "$load5" "$load15" "$cores"
}

# ── DB Stats ────────────────────────────────────────────────────────
render_db() {
  echo ""
  printf "${C_BOLD}  📊 Datenbank Stats:${C_RESET}\n"

  local db_query="SELECT relname||chr(124)||n_live_tup FROM pg_stat_user_tables WHERE relname IN ('pages','content_chunks','links','sources') ORDER BY relname;"
  local db_stats=$(ssh_run "docker exec hetzner-db-1 psql -U sigmabrain -d sigmabrain -t -c \"$db_query\" 2>/dev/null" || echo "")
  # Fallback: try simpler query if above fails
  if [ -z "$db_stats" ]; then
    db_stats=$(ssh_run "docker exec hetzner-db-1 psql -U sigmabrain -d sigmabrain -t -c \"SELECT 'pages|' || COUNT(*) FROM pages; SELECT 'chunks|' || COUNT(*) FROM content_chunks; SELECT 'embedded|' || COUNT(*) FROM content_chunks WHERE embedding IS NOT NULL; SELECT 'pending|' || COUNT(*) FROM content_chunks WHERE embedding IS NULL; SELECT 'links|' || COUNT(*) FROM links; SELECT 'sources|' || COUNT(*) FROM sources;\" 2>/dev/null" || echo "")
  fi

  if [ -n "$db_stats" ]; then
    echo "$db_stats" | while IFS='|' read -r key val; do
      key=$(echo "$key" | xargs)
      val=$(echo "$val" | xargs)
      case "$key" in
        pages)          printf "    Pages:              ${C_CYAN}%s${C_RESET}\n" "$val" ;;
        content_chunks) printf "    Content Chunks:     ${C_CYAN}%s${C_RESET}\n" "$val" ;;
        links)          printf "    Citation Links:     ${C_CYAN}%s${C_RESET}\n" "$val" ;;
        sources)        printf "    Sources:            ${C_CYAN}%s${C_RESET}\n" "$val" ;;
      esac
    done

    # Embedding progress
    local embed_pct=$(ssh_run "docker exec hetzner-db-1 psql -U sigmabrain -d sigmabrain -t -c \"SELECT COALESCE(ROUND(100.0 * COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) / NULLIF(COUNT(*),0), 1), 0) FROM content_chunks;\" 2>/dev/null" | xargs || echo "0")
    if [ "$embed_pct" != "0" ] && [ -n "$embed_pct" ]; then
      local ep_int=$(echo "$embed_pct" | cut -d. -f1)
      printf "    Embedding Coverage: "; bar "$ep_int" 20; printf " %s%%\n" "$embed_pct"
    fi
  else
    printf "    ${C_DIM}DB nicht erreichbar${C_RESET}\n"
  fi
}

# ── Log Tails ───────────────────────────────────────────────────────
render_logs() {
  echo ""
  printf "${C_BOLD}  📜 Letzte Log-Zeilen (Hetzner):${C_RESET}\n"

  # Pipeline logs
  local log_files=$(ssh_run 'ls -t /root/subsumio-pipeline-logs/*.log 2>/dev/null | head -5' || echo "")
  if [ -n "$log_files" ]; then
    echo "$log_files" | while IFS= read -r logfile; do
      [ -z "$logfile" ] && continue
      local fname=$(basename "$logfile")
      local last_lines=$(ssh_run "tail -3 '$logfile' 2>/dev/null" || echo "")
      if [ -n "$last_lines" ]; then
        printf "\n    ${C_MAGENTA}📄 %s${C_RESET}\n" "$fname"
        echo "$last_lines" | while IFS= read -r logline; do
          printf "      ${C_DIM}%s${C_RESET}\n" "$logline"
        done
      fi
    done
  fi

  # Docker logs for corpus-worker (most interesting)
  echo ""
  printf "    ${C_MAGENTA}📄 Docker: corpus-worker (letzte 5 Zeilen)${C_RESET}\n"
  local worker_log=$(ssh_run 'docker logs corpus-worker --tail 5 2>&1' || echo "")
  if [ -n "$worker_log" ]; then
    echo "$worker_log" | while IFS= read -r logline; do
      printf "      ${C_DIM}%s${C_RESET}\n" "$logline"
    done
  else
    printf "      ${C_DIM}keine Logs${C_RESET}\n"
  fi

  # Docker logs for engine
  echo ""
  printf "    ${C_MAGENTA}📄 Docker: hetzner-engine-1 (letzte 3 Zeilen)${C_RESET}\n"
  local engine_log=$(ssh_run 'docker logs hetzner-engine-1 --tail 3 2>&1' || echo "")
  if [ -n "$engine_log" ]; then
    echo "$engine_log" | while IFS= read -r logline; do
      printf "      ${C_DIM}%s${C_RESET}\n" "$logline"
    done
  fi
}

# ── Disk Usage Detail ───────────────────────────────────────────────
render_disk() {
  echo ""
  printf "${C_BOLD}  💾 Disk Usage Detail:${C_RESET}\n"
  local du_out=$(ssh_run 'df -h / /var/lib/docker 2>/dev/null; echo "---"; du -sh /app/law-corpus 2>/dev/null || du -sh /root/law-corpus 2>/dev/null || echo "corpus: not found"' 2>/dev/null || echo "")
  if [ -n "$du_out" ]; then
    echo "$du_out" | while IFS= read -r line; do
      printf "    ${C_DIM}%s${C_RESET}\n" "$line"
    done
  fi
}

# ── Smart Load Balancer ─────────────────────────────────────────────
render_balancer() {
  echo ""
  printf "${C_BOLD}${C_MAGENTA}  ⚖  LOAD BALANCER:${C_RESET}\n"

  # Get Hetzner RAM info
  local hz_mem_info=$(ssh_run 'free -m | awk "/Mem:/{print \$2, \$3, \$7}"' 2>/dev/null | xargs || echo "0 0 0")
  local hz_mem_total=$(echo "$hz_mem_info" | awk '{print $1}')
  local hz_mem_used=$(echo "$hz_mem_info" | awk '{print $2}')
  local hz_mem_avail=$(echo "$hz_mem_info" | awk '{print $3}')

  # Get MacBook RAM
  local mac_mem_total=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
  local mac_mem_active=$(vm_stat 2>/dev/null | awk '/Pages active/ {sum+=$3} END {print sum*4096}' || echo 0)
  local mac_mem_free_mb=$(( (mac_mem_total - mac_mem_active) / 1048576 ))
  local mac_mem_total_gb=$(( mac_mem_total / 1073741824 ))
  local mac_mem_used_gb=$(( mac_mem_active / 1073741824 ))

  local mac_mem_free_gb=$(( mac_mem_free_mb / 1024 ))
  printf "  ${C_DIM}MacBook RAM: ${C_RESET}${C_GREEN}%sGB frei${C_RESET} / %sGB total\n" "$mac_mem_free_gb" "$mac_mem_total_gb"
  printf "  ${C_DIM}Hetzner RAM: ${C_RESET}${C_RED}%sMB frei${C_RESET} / %sMB total (%s%% belegt)\n" "$hz_mem_avail" "$hz_mem_total" "$(( hz_mem_used * 100 / hz_mem_total ))"

  # Get top RAM-consuming processes on Hetzner
  echo ""
  printf "  ${C_BOLD}Hetzner Top RAM-Prozesse (Kandidaten für Umzug):${C_RESET}\n"
  printf "  ${C_DIM}%-7s %-8s %-7s %s${C_RESET}\n" "PID" "RAM(MB)" "%MEM" "COMMAND"

  local hz_procs=$(ssh_run 'ps aux --sort=-%mem | grep -E "bun scripts/|bun /app/scripts/" | grep -v grep | grep -v "ps aux" | grep -v defunct | head -10' 2>/dev/null || echo "")

  local total_movable_ram=0
  local movable_count=0
  local movable_list=""

  if [ -n "$hz_procs" ]; then
    echo "$hz_procs" | while IFS= read -r line; do
      local pid=$(echo "$line" | awk '{print $2}')
      local mem_pct=$(echo "$line" | awk '{print $4}')
      local rss=$(echo "$line" | awk '{print $6}')
      local cmd=$(echo "$line" | awk '{for(i=11;i<=NF;i++) printf "%s ", $i; print ""}' | sed 's/ $//' | sed 's|/app/||g; s|bun scripts/||g; s|bun /app/scripts/||g')
      local rss_mb=$(( rss / 1024 ))
      local short_cmd=$(echo "$cmd" | cut -c1-50)

      # Mark processes that could run on MacBook (imports, downloads — not embed which needs DB locally)
      local can_move="✓"
      if echo "$cmd" | grep -q 'auto-embed'; then can_move="~"; fi
      if echo "$cmd" | grep -q 'serve'; then can_move="✗"; fi
      if echo "$cmd" | grep -q 'next'; then can_move="✗"; fi

      local move_color=$C_GREEN
      [ "$can_move" = "~" ] && move_color=$C_YELLOW
      [ "$can_move" = "✗" ] && move_color=$C_RED

      printf "  %-7s %-8s %-7s ${move_color}%s${C_RESET} %s\n" "$pid" "$rss_mb" "$mem_pct" "$can_move" "$short_cmd"
    done

    # Calculate movable RAM (imports only, not embed/serve)
    local movable_ram=$(ssh_run 'ps aux --sort=-%mem | grep -E "bun scripts/import|bun /app/scripts/import|bun scripts/bulk|bun /app/scripts/bulk" | grep -v grep | grep -v defunct | awk "{sum+=\$6} END {print sum/1024}"' 2>/dev/null || echo 0)
    local movable_ram_int=$(echo "$movable_ram" | cut -d. -f1 2>/dev/null || echo 0)
    [ -z "$movable_ram_int" ] && movable_ram_int=0

    # How many parallel imports could MacBook handle?
    # Each import uses ~1.5GB RAM, MacBook has mac_mem_free_mb free
    local parallel_count=$(( mac_mem_free_mb / 1500 ))
    [ "$parallel_count" -lt 0 ] && parallel_count=0

    echo ""
    printf "  ${C_BOLD}Empfehlung:${C_RESET}\n"
    if [ "$parallel_count" -gt 0 ] 2>/dev/null; then
      printf "    ${C_GREEN}MacBook kann %s parallele Imports laufen lassen${C_RESET}\n" "$parallel_count"
      printf "    ${C_DIM}(~1.5GB pro Import, %sMB frei auf MacBook)${C_RESET}\n" "$mac_mem_free_mb"
    fi

    if [ "$movable_ram_int" -gt 0 ] 2>/dev/null; then
      printf "    ${C_YELLOW}%sMB RAM auf Hetzner durch Import-Prozesse belegt${C_RESET}\n" "$movable_ram_int"
      printf "    ${C_DIM}→ Umzug auf MacBook würde Hetzner %sMB entlasten${C_RESET}\n" "$movable_ram_int"
    fi

    # Show rebalance commands
    echo ""
    printf "  ${C_BOLD}Rebalance Commands:${C_RESET}\n"
    local imports_on_hetzner=$(ssh_run 'ps aux | grep -E "bun scripts/import-judikatur|bun /app/scripts/import-judikatur" | grep -v grep | grep -v defunct | sed "s/.*--source //" | awk "{print \$1}" | sort -u' 2>/dev/null || echo "")
    if [ -n "$imports_on_hetzner" ]; then
      echo "$imports_on_hetzner" | while IFS= read -r src; do
        [ -z "$src" ] && continue
        printf "    ${C_CYAN}# %s auf Hetzner killen + auf MacBook starten:${C_RESET}\n" "$src"
        printf "    ${C_DIM}ssh subsumio-hetzner 'pkill -f \"import-judikatur.*--source $src\"'${C_RESET}\n"
        printf "    ${C_DIM}PGPASSWORD=2bfa7d4107f0b40e171cb508f27a9a703501b160d61957f0 \\\\\n"
        printf "    ${C_DIM}DATABASE_URL=postgres://sigmabrain:2bfa7d4107f0b40e171cb508f27a9a703501b160d61957f0@localhost:5433/sigmabrain \\\\\n"
        printf "    ${C_DIM}bun run server/scripts/import-judikatur.ts --source $src --no-embed${C_RESET}\n"
      done
    fi

    # SSH tunnel status
    echo ""
    local tunnel=$(lsof -i :5433 -P 2>/dev/null | grep LISTEN | head -1)
    if [ -n "$tunnel" ]; then
      printf "  ${C_GREEN}●${C_RESET} SSH Tunnel zur Hetzner DB aktiv (localhost:5433)\n"
    else
      printf "  ${C_YELLOW}○${C_RESET} SSH Tunnel nicht aktiv — starten mit:\n"
      printf "    ${C_DIM}ssh -L 5433:localhost:5432 subsumio-hetzner -N &${C_RESET}\n"
    fi
  else
    printf "  ${C_DIM}keine verschiebbaren Prozesse gefunden${C_RESET}\n"
  fi
}

# ── Rebalance: Auto-move processes from Hetzner to MacBook ──────────
do_rebalance() {
  echo ""
  printf "${C_BOLD}${C_MAGENTA}  ⚖  AUTO-REBALANCE START${C_RESET}\n"
  echo ""

  # 1. Check SSH tunnel
  local tunnel=$(lsof -i :5433 -P 2>/dev/null | grep LISTEN | head -1)
  if [ -z "$tunnel" ]; then
    printf "${C_YELLOW}  → Starte SSH Tunnel zur Hetzner DB...${C_RESET}\n"
    ssh -L 5433:localhost:5432 subsumio-hetzner -N -f 2>/dev/null
    sleep 2
    tunnel=$(lsof -i :5433 -P 2>/dev/null | grep LISTEN | head -1)
    if [ -z "$tunnel" ]; then
      printf "${C_RED}  ✗ SSH Tunnel konnte nicht gestartet werden${C_RESET}\n"
      return 1
    fi
  fi
  printf "${C_GREEN}  ✓ SSH Tunnel aktiv (localhost:5433)${C_RESET}\n"

  # 2. Find import processes on Hetzner that can be moved
  local imports=$(ssh_run 'ps aux | grep -E "bun scripts/import-judikatur|bun /app/scripts/import-judikatur" | grep -v grep | grep -v defunct | sed "s/.*--source //" | awk "{print \$1}" | sort -u' 2>/dev/null || echo "")

  if [ -z "$imports" ]; then
    printf "${C_DIM}  Keine Import-Prozesse auf Hetzner gefunden${C_RESET}\n"
    return 0
  fi

  # 3. Calculate MacBook capacity
  local mac_mem_total=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
  local mac_mem_active=$(vm_stat 2>/dev/null | awk '/Pages active/ {sum+=$3} END {print sum*4096}' || echo 0)
  local mac_mem_free_mb=$(( (mac_mem_total - mac_mem_active) / 1048576 ))
  local parallel_cap=$(( mac_mem_free_mb / 1800 ))  # 1.8GB per import (with overhead)

  printf "${C_DIM}  MacBook kann %s parallele Imports aufnehmen (%sMB frei)${C_RESET}\n" "$parallel_cap" "$mac_mem_free_mb"
  echo ""

  local moved=0
  echo "$imports" | while IFS= read -r src; do
    [ -z "$src" ] && continue
    if [ "$moved" -ge "$parallel_cap" ]; then
      printf "${C_YELLOW}  ⚠ MacBook-Kapazität erreicht (%s/%s)${C_RESET}\n" "$moved" "$parallel_cap"
      break
    fi

    printf "${C_CYAN}  → Umzug: import-judikatur --source %s${C_RESET}\n" "$src"

    # Kill on Hetzner
    printf "    ${C_DIM}Killen auf Hetzner...${C_RESET}\n"
    ssh_run "pkill -f 'import-judikatur.*--source $src'" 2>/dev/null
    sleep 1

    # Start on MacBook with SSH tunnel DB
    printf "    ${C_DIM}Starten auf MacBook...${C_RESET}\n"
    local log_file="/tmp/rebalance-import-$src.log"
    PGPASSWORD=2bfa7d4107f0b40e171cb508f27a9a703501b160d61957f0 \
    DATABASE_URL="postgres://sigmabrain:2bfa7d4107f0b40e171cb508f27a9a703501b160d61957f0@localhost:5433/sigmabrain" \
    nohup bun run server/scripts/import-judikatur.ts --source "$src" --no-embed > "$log_file" 2>&1 &
    local new_pid=$!
    printf "    ${C_GREEN}✓ Gestartet: PID %s (Log: %s)${C_RESET}\n" "$new_pid" "$log_file"
    moved=$((moved + 1))
  done

  echo ""
  printf "${C_BOLD}${C_GREEN}  ✓ Rebalance komplett — %s Prozesse umgezogen${C_RESET}\n" "$moved"
  printf "${C_DIM}  Logs: /tmp/rebalance-import-*.log${C_RESET}\n"
}

# ── Summary / Alerts ────────────────────────────────────────────────
render_alerts() {
  echo ""
  printf "${C_BOLD}${C_YELLOW}  ⚠  ALERTS:${C_RESET}\n"

  local alerts=""

  # Check corpus-worker unhealthy
  if echo "$(ssh_run 'docker ps --filter name=corpus-worker --format {{.Status}}' 2>/dev/null)" | grep -qi unhealthy; then
    alerts+="    ${C_RED}● corpus-worker ist UNHEALTHY${C_RESET}\n"
  fi

  # Check zombie processes
  local zombies=$(ssh_run 'ps aux | grep -c "\[bun\] <defunct>"' 2>/dev/null || echo 0)
  if [ "$zombies" -gt 0 ] 2>/dev/null; then
    alerts+="    ${C_YELLOW}● $zombies Zombie-Prozesse (bun defunct)${C_RESET}\n"
  fi

  # Check disk > 80%
  local disk_pct=$(ssh_run 'df / | awk "NR==2{print \$5}" | tr -d %' 2>/dev/null || echo 0)
  if [ "$disk_pct" -gt 80 ] 2>/dev/null; then
    alerts+="    ${C_RED}● Disk usage > 80% (${disk_pct}%)${C_RESET}\n"
  fi

  # Check if port 3000 is down locally
  if ! lsof -i :3000 -P 2>/dev/null | grep -q LISTEN; then
    alerts+="    ${C_YELLOW}● Lokaler dev server (Port 3000) nicht aktiv${C_RESET}\n"
  fi

  if [ -z "$alerts" ]; then
    printf "    ${C_GREEN}✓ Alle Systeme normal${C_RESET}\n"
  else
    printf "%b" "$alerts"
  fi
}

# ── Render buffer (in-place update) ─────────────────────────────────
RENDER_LINES=()
FIRST_RENDER=true

emit() {
  RENDER_LINES+=("$1")
}

# ── Kill Zombies on Hetzner ─────────────────────────────────────────
kill_zombies() {
  local zombies=$(ssh_run 'ps aux | grep "\[bun\] <defunct>" | awk "{print \$2}"' 2>/dev/null || echo "")
  if [ -n "$zombies" ]; then
    local count=$(echo "$zombies" | wc -l | xargs)
    # Zombies can't be killed directly — kill their parent
    local parents=$(ssh_run 'ps aux | grep "\[bun\] <defunct>" | awk "{print \$3}" | sort -u' 2>/dev/null || echo "")
    echo "  Found $count zombie processes. Parent PIDs: $(echo $parents | tr '\n' ' ')
  Zombies sind bereits tot (defunct) — sie belegen keine CPU/RAM mehr.
  Ihr Parent-Prozess muss sie reappen. Falls sie stoeren, Parent killen."
  else
    echo "  Keine Zombies gefunden."
  fi
}

# ── Main Render (in-place, no flicker) ──────────────────────────────
render() {
  RENDER_LINES=()
  local now=$(date "+%Y-%m-%d %H:%M:%S")
  emit "${C_BOLD}${C_BG_BLUE}  SUBSUMIO PIPELINE MONITOR  %s  ${C_RESET}" "$now"
  # We'll handle hr differently — store as a line
  
  # Build all lines into RENDER_LINES array
  # We use a temp approach: capture output to array
  _render_all
}

_render_all() {
  local now=$(date "+%Y-%m-%d %H:%M:%S")
  local width=${COLUMNS:-120}
  local sep=$(printf "%${width}s" "" | tr ' ' '─')

  RENDER_LINES=(
    "${C_BOLD}${C_BG_BLUE}  SUBSUMIO PIPELINE MONITOR  ${now}  ${C_RESET}"
    "${C_DIM}${sep}${C_RESET}"
  )

  # We need to capture output from render functions into the array
  # Using a temp file approach for reliability
  local tmpfile=$(mktemp)
  {
    render_local
    render_hetzner
    if $SHOW_DB; then render_db; fi
    if $SHOW_LOGS; then render_logs; fi
    if $SHOW_DISK; then render_disk; fi
    if $SHOW_BALANCE || $DO_REBALANCE; then render_balancer; fi
    render_alerts

    # Kill zombies if requested
    if $KILL_ZOMBIES; then
      echo ""
      printf "${C_BOLD}  🧹 Zombie Cleanup:${C_RESET}\n"
      kill_zombies
    fi

    echo ""
    printf "${C_DIM}${sep}${C_RESET}\n"
    printf "${C_DIM}  Refresh: %ss | Flags: --watch --logs --db --disk --all --kill-zombies | Ctrl+C zum Beenden${C_RESET}\n" "$REFRESH_INTERVAL"
  } > "$tmpfile"

  # Read temp file into array
  while IFS= read -r line; do
    RENDER_LINES+=("$line")
  done < "$tmpfile"
  rm -f "$tmpfile"
}

# ── In-place display (no clear, no flicker) ─────────────────────────
display_inplace() {
  if $FIRST_RENDER; then
    # First render: just print all lines
    for line in "${RENDER_LINES[@]}"; do
      printf '%s\n' "$line"
    done
    FIRST_RENDER=false
  else
    # Move cursor to top, overwrite lines in place
    printf '\033[H'  # cursor to home (0,0)
    for line in "${RENDER_LINES[@]}"; do
      # Clear to end of line, then print
      printf '\033[2K%s\n' "$line"
    done
    # Clear any remaining lines from previous render
    printf '\033[J'
  fi
}

# ── Main Loop ───────────────────────────────────────────────────────
if $DO_REBALANCE; then
  do_rebalance
  echo ""
  printf "${C_DIM}Warte 10s dann Monitor-Ansicht...${C_RESET}\n"
  sleep 10
fi

if $WATCH; then
  trap 'printf "\033[?25h"; echo ""; printf "${C_GREEN}Monitor beendet.${C_RESET}\n"; exit 0' INT TERM
  # Hide cursor
  printf '\033[?25l'
  FIRST_RENDER=true
  while true; do
    render
    display_inplace
    sleep "$REFRESH_INTERVAL"
  done
else
  # Single shot — just render and print
  render
  for line in "${RENDER_LINES[@]}"; do
    printf '%s\n' "$line"
  done
fi
