use soroban_sdk::{
    testutils::{Address as _, MockAuth, MockAuthInvoke},
    Address, BytesN, Env, IntoVal, String,
};
use talakit_registry::{Project, RegistryError, TalaKitRegistry, TalaKitRegistryClient};

fn setup() -> (Env, TalaKitRegistryClient<'static>, Address, BytesN<32>) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(TalaKitRegistry, ());
    let client = TalaKitRegistryClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    let metadata_hash = BytesN::from_array(&env, &[7; 32]);

    (env, client, owner, metadata_hash)
}

fn register_demo_project(
    env: &Env,
    client: &TalaKitRegistryClient,
    owner: &Address,
    metadata_hash: &BytesN<32>,
) -> u64 {
    client.register_project(owner, &String::from_str(env, "DemoPay"), metadata_hash)
}

#[test]
fn register_project_stores_authoritative_registry_state() {
    let (env, client, owner, metadata_hash) = setup();

    let project_id = register_demo_project(&env, &client, &owner, &metadata_hash);
    let project = client.get_project(&project_id).unwrap();

    assert_eq!(project_id, 1);
    assert_eq!(
        project,
        Project {
            id: project_id,
            owner,
            name: String::from_str(&env, "DemoPay"),
            metadata_hash,
            active: true,
            created_ledger: env.ledger().sequence(),
        }
    );
    assert_eq!(client.get_project_contracts(&project_id).len(), 0);
}

#[test]
fn add_and_remove_official_contract_ids() {
    let (env, client, owner, metadata_hash) = setup();
    let project_id = register_demo_project(&env, &client, &owner, &metadata_hash);
    let official_contract = Address::generate(&env);

    client.add_contract(&project_id, &official_contract);
    assert_eq!(
        client.get_project_contracts(&project_id),
        soroban_sdk::vec![&env, official_contract.clone()]
    );

    client.remove_contract(&project_id, &official_contract);
    assert_eq!(client.get_project_contracts(&project_id).len(), 0);
}

#[test]
fn duplicate_contract_ids_are_rejected() {
    let (env, client, owner, metadata_hash) = setup();
    let project_id = register_demo_project(&env, &client, &owner, &metadata_hash);
    let official_contract = Address::generate(&env);

    client.add_contract(&project_id, &official_contract);
    let err = client
        .try_add_contract(&project_id, &official_contract)
        .unwrap_err()
        .unwrap();

    assert_eq!(err, RegistryError::ContractAlreadyAdded);
}

#[test]
fn inactive_projects_cannot_add_contracts() {
    let (env, client, owner, metadata_hash) = setup();
    let project_id = register_demo_project(&env, &client, &owner, &metadata_hash);
    let official_contract = Address::generate(&env);

    client.deactivate_project(&project_id);
    let err = client
        .try_add_contract(&project_id, &official_contract)
        .unwrap_err()
        .unwrap();

    assert_eq!(err, RegistryError::InactiveProject);
}

#[test]
fn ownership_transfer_changes_required_owner() {
    let (env, client, owner, metadata_hash) = setup();
    let project_id = register_demo_project(&env, &client, &owner, &metadata_hash);
    let new_owner = Address::generate(&env);

    client.transfer_ownership(&project_id, &new_owner);

    let project = client.get_project(&project_id).unwrap();
    assert_eq!(project.owner, new_owner);
}

#[test]
fn invalid_project_names_are_rejected() {
    let (env, client, owner, metadata_hash) = setup();

    let err = client
        .try_register_project(&owner, &String::from_str(&env, ""), &metadata_hash)
        .unwrap_err()
        .unwrap();

    assert_eq!(err, RegistryError::InvalidName);
}

#[test]
fn non_owner_auth_cannot_mutate_project_contracts() {
    let env = Env::default();
    let contract_id = env.register(TalaKitRegistry, ());
    let client = TalaKitRegistryClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    let non_owner = Address::generate(&env);
    let metadata_hash = BytesN::from_array(&env, &[7; 32]);
    let name = String::from_str(&env, "DemoPay");

    let project_id = client
        .mock_auths(&[MockAuth {
            address: &owner,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "register_project",
                args: (&owner, &name, &metadata_hash).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .register_project(&owner, &name, &metadata_hash);

    let official_contract = Address::generate(&env);
    let result = client
        .mock_auths(&[MockAuth {
            address: &non_owner,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "add_contract",
                args: (&project_id, &official_contract).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_add_contract(&project_id, &official_contract);

    assert!(result.is_err());
    assert_eq!(client.get_project_contracts(&project_id).len(), 0);
}
