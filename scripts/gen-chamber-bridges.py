from pathlib import Path

root = Path(__file__).resolve().parent.parent / "src" / "chambers"
names = [
    "AtlasGraphView",
    "CapabilitiesView",
    "JournalChamber",
    "DirectiveControlCenter",
    "CrucibleView",
    "MindCartography",
    "ConsoleView",
    "GapLedger",
    "AuditLogView",
    "ResonanceChamber",
    "ChangeControl",
    "ArenaMode",
    "ForgeMode",
    "MirrorMode",
    "SignalsMode",
    "KnowledgeChamber",
    "LineageMode",
    "TopologyView",
    "SalonView",
    "CognitiveSignature",
    "DiscussionBoard",
    "DecisionsView",
    "ScenariosView",
    "DoctrineView",
    "RedTeamView",
    "PulseView",
    "InnerCouncil",
    "MasteryTheater",
    "ContinuityEngine",
    "CanonView",
    "RelationshipDynamics",
    "PrivacyCenter",
    "ConstitutionView",
    "LifeDomainMap",
    "OperatingManual",
    "EssentialMode",
    "ForgeArtifact",
    "Mirrorforge",
    "CoreSystemsView",
    "StrategicModelingWorkbench",
    "SovereignAtrium",
    "Chrysalis",
    "VaultView",
    "DriftView",
    "EvolutionRoadmap",
    "SecondSun",
    "FinalFilter",
    "DeepWorkChamber",
    "LeviathanMode",
    "Onboarding",
    "HumanizationControls",
]
for n in names:
    p = root / f"{n}.tsx"
    body = (
        f"/** Chamber bridge — lazy map imports `src/chambers/{n}`. */\n"
        f"export {{ {n} }} from '../components/{n}';\n"
    )
    p.write_text(body, encoding="utf-8")
    print("wrote", n)

intel = root / "IntelligenceChambersViews.tsx"
intel.write_text(
    "/** Chamber bridge — trajectory / friction / threshold intelligence views. */\n"
    "export {\n"
    "  TrajectoryObservatoryView,\n"
    "  FrictionCartographyView,\n"
    "  ThresholdProtocolForgeView,\n"
    "} from '../components/intelligence/IntelligenceChambersViews';\n",
    encoding="utf-8",
)
print("wrote IntelligenceChambersViews")
