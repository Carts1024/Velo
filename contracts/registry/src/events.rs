use soroban_sdk::{contractevent, Address};

#[contractevent(topics = ["project", "reg"])]
pub struct ProjectRegistered {
    pub project_id: u64,
    pub owner: Address,
}

#[contractevent(topics = ["project", "update"])]
pub struct ProjectUpdated {
    pub project_id: u64,
    pub owner: Address,
}

#[contractevent(topics = ["contract", "add"])]
pub struct ContractAdded {
    pub project_id: u64,
    pub contract_id: Address,
}

#[contractevent(topics = ["contract", "remove"])]
pub struct ContractRemoved {
    pub project_id: u64,
    pub contract_id: Address,
}

#[contractevent(topics = ["project", "xfer"])]
pub struct OwnershipTransferred {
    pub project_id: u64,
    pub old_owner: Address,
    pub new_owner: Address,
}

#[contractevent(topics = ["project", "deact"])]
pub struct ProjectDeactivated {
    pub project_id: u64,
    pub owner: Address,
}
