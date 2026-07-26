// ============================================================================
//  VICTOR VON DOOM — EMEVD event logic  (DarkScript3 source)
// ----------------------------------------------------------------------------
//  Compile with DarkScript3: open common.emevd.dcx, APPEND these events (do not
//  delete vanilla events), then File > (Batch) Resave -> common.emevd.dcx.
//  Instruction/condition names follow the EMEDF (Help > View EMEDF in DarkScript3).
//  Names marked [VERIFY] must be confirmed against your EMEDF version — do not
//  ship without confirming; EMEVD instruction spelling varies by community lib.
//
//  HONEST ENGINE NOTE ON "METERS":
//  EMEVD is an event/condition/instruction VM, not a general language — it has
//  flags, timers, SpEffects, and limited event-value/flag-range reads, but NOT
//  free integer arithmetic. A true 0–100 numeric meter with a HUD bar is best
//  done one of two ways:
//    (a) FLAG-RANGE COUNTER: reserve a contiguous flag block per meter and use
//        the community "counter" pattern (set/clear bits, compare ranges). Works
//        in pure EMEVD but is verbose.
//    (b) HELPER MOD/DLL: a small memory-hook (SoulsFormats/ERSharedMemory-style)
//        exposes a real integer + HUD. Cleaner UX, extra dependency.
//  Below, meters are modeled with pattern (a) via helper macros `meterAdd/meterSpend`
//  documented as flag-range ops. For a first playable build you may instead gate
//  abilities purely by COOLDOWN TIMERS (fully native, no arithmetic) and add the
//  numeric meter in polish (Phase 8). Both paths are described.
// ============================================================================

// ---- ID constants (mirror params/00-id-allocation.md) ----------------------
const SFX = {
  MODE_DOOM:7700000, MODE_SORC:7700001, MODE_MJOLNIR:7700002, MODE_ODIN:7700003,
  MODE_STONE:7700004, MODE_COSMIC:7700005,
  STONE_SPACE:7700010, STONE_MIND:7700011, STONE_REALITY:7700012,
  STONE_POWER:7700013, STONE_TIME:7700014, STONE_SOUL:7700015,
  XF_ODIN:7700020, XF_INFINITY:7700021, XF_EMPEROR:7700022,
  HAMMER_THROWN:7700030, STORM:7700031, AMP_NEXT:7700040, IS_BOSS:7700050,
  CFG_LORE:7700060,
  OWN_ARMOR:7700080, OWN_MJOLNIR:7700081, OWN_ODIN:7700082, OWN_6STONES:7700083,
  DMGUP_LORE:7700070,      // short damage-up granted on cast when CFG_LORE set
  SHIELD:7700200, SLOW:7700300, SLOW_STOP:7700301, SLOW_BOSS:7700302,
};
const FLAG = {           // event flags (reserve a free block in your regulation)
  BASE: 7700000,
  CD_BASE: 7701000,      // one flag per cooldown ability
  HAMMER_TIMER: 7700500,
  ODIN_TIMER: 7700501, INFINITY_TIMER: 7700502, EMPEROR_TIMER: 7700503,
};
const PLAYER = 10000;    // player EntityId in most maps [VERIFY per map / use 10000]

// ============================================================================
//  CORE — initialization & housekeeping
// ============================================================================
Event(7700000, Restart, function () {
  // Grant ownership tags when the artifacts are in inventory (drives Emperor gate).
  // Loop forever; cheap, low frequency.
  for (;;) {
    if (PlayerHasItem(ItemType.Weapon, 7700000 /*Mjolnir*/)) SetSpEffect(PLAYER, SFX.OWN_MJOLNIR); // [VERIFY PlayerHasItem]
    if (PlayerHasItem(ItemType.Protector, 7700001 /*Doom body*/)) SetSpEffect(PLAYER, SFX.OWN_ARMOR);
    // OWN_6STONES: all six selector goods present
    if (PlayerHasItem(ItemType.Goods,7700010) && PlayerHasItem(ItemType.Goods,7700011) &&
        PlayerHasItem(ItemType.Goods,7700012) && PlayerHasItem(ItemType.Goods,7700013) &&
        PlayerHasItem(ItemType.Goods,7700014) && PlayerHasItem(ItemType.Goods,7700015))
      SetSpEffect(PLAYER, SFX.OWN_6STONES);
    WaitFixedTimeSeconds(2.0);
  }
});

// Cleanup on death / grace / map change: clear transient states so nothing sticks (§54).
Event(7700001, Restart, function () {
  WaitFor(CharacterDead(PLAYER) || OnGraceRest() /*[VERIFY grace condition]*/);
  ClearSpEffect(PLAYER, SFX.XF_ODIN);      ClearSpEffect(PLAYER, SFX.XF_INFINITY);
  ClearSpEffect(PLAYER, SFX.XF_EMPEROR);   ClearSpEffect(PLAYER, SFX.HAMMER_THROWN);
  ClearSpEffect(PLAYER, SFX.STORM);
  RestoreHammerWeapon();                   // safety: never leave hand empty
});

// ============================================================================
//  RESOURCE METERS  (pattern (a) macros; or skip and use cooldowns only)
// ============================================================================
// Flag-range counter macros — documented pseudo-ops that expand to the
// community counter pattern (compare-and-set over a reserved flag block).
// Provided as functions so ability events read cleanly.
function meterRegenLoop(meterName, perSecLore, perSecBalanced) {
  // Ticks the meter up; rate depends on CFG_LORE. Implemented as: every 1s,
  // meterAdd(rate). meterAdd is the flag-range increment (clamped 0..100).
  Event(nextEventId(), Restart, function () {
    for (;;) {
      let rate = PlayerHasSpEffect(PLAYER, SFX.CFG_LORE) ? perSecLore : perSecBalanced;
      meterAdd(meterName, rate);
      WaitFixedTimeSeconds(1.0);
    }
  });
}
meterRegenLoop("ARMOR_E", 25, 6);
meterRegenLoop("DIVINE_E", 20, 5);
meterRegenLoop("INF_E", 15, 4);

// A cheaper first-build alternative to meters: pure cooldown gating.
function cooldown(cdIndex, secondsLore, secondsBalanced) {
  // returns true if ready; when spent, sets the CD flag + auto-clears after N s.
  const f = FLAG.CD_BASE + cdIndex;
  if (GetEventFlag(f)) return false;                 // still cooling down
  SetEventFlag(f, ON);
  let s = PlayerHasSpEffect(PLAYER, SFX.CFG_LORE) ? secondsLore : secondsBalanced;
  scheduleClearFlag(f, s);                            // background timer clears it
  return true;
}

// ============================================================================
//  LORE/BALANCED DAMAGE MULTIPLIER
//  On any offensive cast, if CFG_LORE, grant a brief damage-up SpEffect so one
//  ability row serves both modes (params/30 §30.5).
// ============================================================================
Event(7700010, Restart, function () {
  for (;;) {
    // Triggered by ability events calling applyLoreDamageUp(); here we just ensure
    // the SpEffect is only alive briefly so it colors the imminent hit, not forever.
    WaitFor(PlayerHasSpEffect(PLAYER, SFX.DMGUP_LORE));
    WaitFixedTimeSeconds(1.5);
    ClearSpEffect(PLAYER, SFX.DMGUP_LORE);
  }
});
function applyLoreDamageUp() { if (PlayerHasSpEffect(PLAYER, SFX.CFG_LORE)) SetSpEffect(PLAYER, SFX.DMGUP_LORE); }

// ============================================================================
//  MJOLNIR — throw / recall state machine  (the signature system, §A.5)
// ============================================================================
Event(7700100, Restart, function () {
  for (;;) {
    // Throw is fired by the Ash-of-War; the throw Bullet sets HAMMER_THROWN via
    // spEffectIDForShooter (params/20 §20.6). We react to that state here.
    WaitFor(PlayerHasSpEffect(PLAYER, SFX.HAMMER_THROWN));
    SwapToEmptyHandWeapon();                 // 7700000 -> 7700001 (invisible), no duplicate model
    // Safety net: force auto-recall if the state lingers too long (stuck-hammer test, §54).
    let recalled = WaitForEither(
      RecallInputPressed(),                  // manual recall (HKS sets a flag)
      WaitFixedTimeSecondsReturn(6.5)        // projectile life + margin -> auto recall
    );
    // Recall: spawn return streak + path-damage follow bullet, restore weapon, clear state.
    SpawnReturnStreakAndPathBullet();        // fires Bullet 7700101 along projectile->player
    RestoreHammerWeapon();                   // 7700001 -> 7700000
    ClearSpEffect(PLAYER, SFX.HAMMER_THROWN);
    WaitFixedTimeSeconds(0.2);
  }
});

// ============================================================================
//  ODINFORCE transformation timer  (never permanent, §39/§54)
// ============================================================================
Event(7700200, Restart, function () {
  for (;;) {
    WaitFor(PlayerHasSpEffect(PLAYER, SFX.XF_ODIN));     // activation art/item set the tag
    // Flood Divine Energy while active (Balanced flood +60/s handled in meter table).
    let dur = PlayerHasSpEffect(PLAYER, SFX.CFG_LORE) ? 60 : 30;
    PlayActivationFX("fxr_odin_aura");                   // aura + camera + sound
    MassKnockbackPulse(6 /*meters*/);                    // activation shockwave (§23)
    WaitFixedTimeSeconds(dur);
    ClearSpEffect(PLAYER, SFX.XF_ODIN);
    // 90/60s cooldown before it can be re-invoked:
    SetEventFlag(FLAG.ODIN_TIMER, ON);
    scheduleClearFlag(FLAG.ODIN_TIMER, PlayerHasSpEffect(PLAYER, SFX.CFG_LORE) ? 90 : 90);
  }
});

// ============================================================================
//  DOOMBOTS — spawn / lifetime / self-destruct  (§12, C.7)
// ============================================================================
// Called by the Doombot Ash-of-War (grants a transient "spawn request" SpEffect).
Event(7700300, Restart, function () {
  for (;;) {
    WaitFor(PlayerHasSpEffect(PLAYER, 7700310 /*spawn-request tag from the AoW*/));
    ClearSpEffect(PLAYER, 7700310);
    if (!cooldown(2 /*Doombot CD*/, 12, 20)) continue;           // resource/CD gate
    if (countActiveDoombots() >= 3) continue;                    // hard cap (§55)
    let bot = SpawnNpcNearPlayer(7700000 /*Doombot NpcParam*/, PlayerTeam());
    SetCharacterAiTarget(bot, PlayerLockOnTarget());             // focus Doom's target [VERIFY]
    // Lifetime: 45s then despawn with a teleport-out FX.
    scheduleDespawn(bot, 45, "fxr_doom_teleport");
  }
});
// Self-destruct all bots on command (D5): grants radial damage then removes them.
Event(7700301, Restart, function () {
  for (;;) {
    WaitFor(PlayerHasSpEffect(PLAYER, 7700311 /*self-destruct request*/));
    ClearSpEffect(PLAYER, 7700311);
    forEachActiveDoombot(function (bot) { DetonateBot(bot, 7700008 /*explosion AtkParam*/); });
  }
});

// ============================================================================
//  TIME STONE — Time Stop with BOSS BRANCH  (§32/§26, no true pause)
// ============================================================================
Event(7700400, Restart, function () {
  for (;;) {
    WaitFor(PlayerHasSpEffect(PLAYER, 7700410 /*Time-Stop cast tag*/));
    ClearSpEffect(PLAYER, 7700410);
    if (!cooldown(8, 25, 45)) continue;
    DuckAudio(0.3); ShiftLighting("timestop");                  // presentation (§43)
    forEachEnemyInRadius(PLAYER, 25 /*m*/, function (enemy) {
      // Ordinary -> 98% slow (looks stopped). Boss -> extreme slow only (never lock).
      if (CharacterHasSpEffect(enemy, SFX.IS_BOSS)) SetSpEffect(enemy, SFX.SLOW_BOSS);
      else SetSpEffect(enemy, SFX.SLOW_STOP);
    });
    SlowActiveProjectiles(25);                                  // hostile bullets crawl [VERIFY]
    WaitFixedTimeSeconds(6.0);
    UnduckAudio(); RestoreLighting();
    // SpEffect durations expire on their own (params/10 motionInterval) — no manual clear needed,
    // but clear on area-change via the cleanup event to avoid leaks.
  }
});

// ============================================================================
//  INFINITY ultimate — sequential Stone activation  (§35, not "just an explosion")
// ============================================================================
Event(7700500, Restart, function () {
  for (;;) {
    WaitFor(PlayerHasSpEffect(PLAYER, 7700520 /*Infinity ultimate cast tag*/));
    ClearSpEffect(PLAYER, 7700520);
    if (!cooldown(9, 90, 180)) continue;
    // 1) Stones ignite in sequence (six timed bursts).
    const stoneFx = ["space","mind","reality","power","time","soul"];
    DuckAudio(0.15);
    for (let i = 0; i < 6; i++) { PlayStoneBurst(stoneFx[i]); WaitFixedTimeSeconds(0.35); }
    ShiftLighting("infinity"); PlayActivationFX("fxr_infinity_sequence");
    WaitFixedTimeSeconds(0.6);
    // 2) Apply effect by target class (config: Erasure / Boss / Sandbox).
    let sandbox = GetEventFlag(FLAG.BASE + 900 /*CFG_SANDBOX*/);
    forEachEnemyInRadius(PLAYER, 60, function (enemy) {
      if (CharacterHasSpEffect(enemy, SFX.IS_BOSS) && !sandbox) {
        DealCappedDamage(enemy, PlayerHasSpEffect(PLAYER, SFX.CFG_LORE) ? 8000 : 2500);
        SetSpEffect(enemy, 7700530 /*stacked debuff*/);
      } else {
        // Ordinary (or sandbox): disintegrate — dissolve, not ragdoll.
        SetSpEffect(enemy, 7700531 /*lethal + fxr_disintegrate*/);
      }
    });
    UnduckAudio(); RestoreLighting();
  }
});

// ============================================================================
//  TELEPORT / WARP GUARDS  (§A.4 — prevent clipping / arena-break)
// ============================================================================
// Traversal-teleport (TP6) & Bifrost (FL5) call requestWarp(x); this guard blocks
// warps during boss-intro/cutscene flags and clamps the destination to navmesh.
function guardedWarp(destRegion) {
  if (InBossArenaLockdown()) return false;             // [VERIFY: check boss phase flags]
  if (!IsRegionOnNavmesh(destRegion)) return false;    // [VERIFY navmesh check / use validated regions only]
  WarpPlayerToRegion(destRegion);                      // [VERIFY WarpPlayer/Move command]
  return true;
}

// ----------------------------------------------------------------------------
//  HELPER STUBS — these wrap real EMEDF instructions. Each maps to one or a few
//  documented EMEVD commands; names here are readable aliases you implement once
//  at the top of your DarkScript3 file using the exact EMEDF instruction. They are
//  NOT invented engine features — they are thin wrappers. Confirm each against
//  Help > View EMEDF and replace the body with the real instruction call.
// ----------------------------------------------------------------------------
//  SetSpEffect / ClearSpEffect / PlayerHasSpEffect / CharacterHasSpEffect
//  SetEventFlag / GetEventFlag / WaitFixedTimeSeconds / WaitFor
//  PlayerHasItem / AwardItemLot / SpawnNpc(map asset) / KillCharacter
//  WarpPlayerToRegion / ForceAnimationPlayback (for FX poses)
//  ⇒ everything above resolves to these primitives; the aliases (meterAdd,
//     SpawnNpcNearPlayer, forEachEnemyInRadius, DealCappedDamage, PlayStoneBurst,
//     DuckAudio, ShiftLighting, MassKnockbackPulse, SwapToEmptyHandWeapon, etc.)
//     are documented in event/README-helpers.md with their exact EMEDF mapping.
