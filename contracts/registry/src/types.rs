use soroban_sdk::{contracttype, Address, BytesN, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Project {
    pub id: u64,
    pub owner: Address,
    pub name: String,
    pub metadata_hash: BytesN<32>,
    pub active: bool,
    pub created_ledger: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    NextProjectId,
    Project(u64),
    ProjectContracts(u64),
}
