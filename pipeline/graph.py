from langgraph.graph import StateGraph, END
from nodes.ingest            import ingest_node
from nodes.validate          import validate_node
from nodes.retrieve_context  import retrieve_context_node
from nodes.impact_analysis   import impact_node
from nodes.generate_alert    import generate_alert_node
from nodes.confidence_check  import confidence_check_node
from nodes.dispatch          import dispatch_node

def build_graph():
    graph = StateGraph(dict)

    # Register all 7 nodes
    graph.add_node("ingest",            ingest_node)
    graph.add_node("validate",          validate_node)
    graph.add_node("retrieve_context",  retrieve_context_node)
    graph.add_node("impact",            impact_node)
    graph.add_node("generate",          generate_alert_node)
    graph.add_node("confidence_check",  confidence_check_node)
    graph.add_node("dispatch",          dispatch_node)

    # Entry point
    graph.set_entry_point("ingest")

    # Linear pipeline: ingest → validate → retrieve_context → impact → generate → confidence_check → dispatch
    graph.add_edge("ingest",           "validate")
    graph.add_edge("validate",         "retrieve_context")
    graph.add_edge("retrieve_context", "impact")
    graph.add_edge("impact",           "generate")
    graph.add_edge("generate",         "confidence_check")
    graph.add_edge("confidence_check", "dispatch")
    graph.add_edge("dispatch",         END)

    # Early exit: if no districts flagged after validate, skip to END
    graph.add_conditional_edges(
        "validate",
        lambda state: "retrieve_context" if state.get("flagged_data") else END,
    )

    return graph.compile()