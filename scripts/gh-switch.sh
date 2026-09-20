#!/bin/bash
# Cambia la cuenta activa de GitHub CLI (gh) Y, si estás dentro de un repo
# git, ajusta también la identidad de commit (user.name/user.email) de ESE
# repo para que coincida — solo a nivel local del repo, nunca toca tu
# configuración global.
#
# Uso: ./scripts/gh-switch.sh [steven|eveen]
# Sin argumento, te deja elegir de un menú.
#
# Por qué: antes `gh auth switch` cambiaba con qué cuenta se autentica el
# push, pero la identidad del commit (quién aparece como autor) seguía
# siendo la de tu configuración global de git, sin importar qué cuenta de
# gh estuviera activa. Eso causaba que un repo pensado para una cuenta
# terminara con commits firmados por la otra. Este script arregla las dos
# cosas en un solo paso.

set -e

STEVEN="stevenesp05-hub"
EVEEN="eveenstudio-hub"

target="$1"

if [ -z "$target" ]; then
  echo "¿A qué cuenta quieres cambiar?"
  echo "  1) $STEVEN"
  echo "  2) $EVEEN"
  read -p "Elige 1 o 2: " choice
  case "$choice" in
    1) target="steven" ;;
    2) target="eveen" ;;
    *) echo "Opción inválida."; exit 1 ;;
  esac
fi

case "$target" in
  steven) user="$STEVEN" ;;
  eveen) user="$EVEEN" ;;
  *) echo "Uso: $0 [steven|eveen]"; exit 1 ;;
esac

echo "→ Cambiando cuenta activa de gh a $user..."
gh auth switch --hostname github.com --user "$user"
echo ""
gh auth status
echo ""

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  repo_root="$(git rev-parse --show-toplevel)"
  echo "→ Ajustando identidad de commit de este repo ($repo_root) a $user..."

  account_id="$(gh api user --hostname github.com -q .id 2>/dev/null || true)"

  if [ -n "$account_id" ]; then
    noreply_email="${account_id}+${user}@users.noreply.github.com"
    git config --local user.name "$user"
    git config --local user.email "$noreply_email"
    echo "  user.name  = $user"
    echo "  user.email = $noreply_email"
    echo "  (solo en este repo — tu configuración global no se toca)"
  else
    echo "  No se pudo leer el id de la cuenta desde la API de GitHub."
    echo "  La cuenta de gh ya quedó cambiada, pero ajusta user.name/user.email"
    echo "  del repo a mano si lo necesitas."
  fi
else
  echo "→ No estás dentro de un repo git; solo se cambió la cuenta de gh."
fi
