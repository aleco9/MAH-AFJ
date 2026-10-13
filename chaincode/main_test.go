package main

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/hyperledger/fabric-chaincode-go/v2/pkg/cid"
	"github.com/hyperledger/fabric-chaincode-go/v2/shim"
	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

const validID = "00000000-0000-4000-8000-000000000001"

var validHash = strings.Repeat("a", 64)

const schema = "MAH-AFJ-CANON-1"

// Embedded interfaces fail loudly if production calls an unimplemented method.
// These doubles exercise the contract logic, not Fabric consensus or MSP validation.
type testIdentity struct {
	cid.ClientIdentity
	org string
	err error
}

func (i *testIdentity) GetMSPID() (string, error) { return i.org, i.err }

type testStub struct {
	shim.ChaincodeStubInterface
	data           map[string][]byte
	getErr, putErr error
	reads, writes  int
}

func (s *testStub) GetState(key string) ([]byte, error) { s.reads++; return s.data[key], s.getErr }
func (s *testStub) PutState(key string, b []byte) error {
	s.writes++
	if s.putErr != nil {
		return s.putErr
	}
	s.data[key] = append([]byte(nil), b...)
	return nil
}
func (s *testStub) GetTxID() string { return "synthetic-tx" }
func fixture(org string) (*contractapi.TransactionContext, *testStub, *testIdentity) {
	s := &testStub{data: map[string][]byte{}}
	i := &testIdentity{org: org}
	ctx := new(contractapi.TransactionContext)
	ctx.SetStub(s)
	ctx.SetClientIdentity(i)
	return ctx, s, i
}
func requireErr(t *testing.T, err error, want string) {
	t.Helper()
	if err == nil || !strings.Contains(err.Error(), want) {
		t.Fatalf("want %s, got %v", want, err)
	}
}
func TestValidation(t *testing.T) {
	cases := []struct {
		name, id, hash, scheme string
		valid                  bool
	}{
		{"valid", validID, validHash, schema, true}, {"empty-id", "", validHash, schema, false},
		{"path-id", "../bad", validHash, schema, false}, {"uppercase-id", strings.ToUpper(validID[:8]) + "-AAAA-4000-8000-000000000001", validHash, schema, false},
		{"short-id", validID[:35], validHash, schema, false}, {"empty-hash", validID, "", schema, false},
		{"short-hash", validID, validHash[:63], schema, false}, {"long-hash", validID, validHash + "a", schema, false},
		{"nonhex-hash", validID, strings.Repeat("g", 64), schema, false}, {"uppercase-hash", validID, strings.ToUpper(validHash), schema, false},
		{"unknown-schema", validID, validHash, "unknown", false}, {"empty-schema", validID, validHash, "", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := validate(c.id, c.hash, c.scheme)
			if c.valid {
				if err != nil {
					t.Fatal(err)
				}
			} else {
				requireErr(t, err, "INVALID_EVIDENCE")
			}
		})
	}
}
func TestRegisterEvidence(t *testing.T) {
	t.Run("persists-minimal-anchor", func(t *testing.T) {
		ctx, s, _ := fixture("Org1MSP")
		a, err := new(Contract).RegisterEvidence(ctx, validID, validHash, schema)
		if err != nil {
			t.Fatal(err)
		}
		if a.EventID != validID || a.RecordHash != validHash || a.Schema != schema || a.TxID != "synthetic-tx" {
			t.Fatalf("bad anchor: %+v", a)
		}
		var stored map[string]any
		if err = json.Unmarshal(s.data["event:"+validID], &stored); err != nil {
			t.Fatal(err)
		}
		if len(stored) != 4 || s.writes != 1 {
			t.Fatal("unexpected payload or write count")
		}
	})
	t.Run("invalid-input-before-identity-or-storage", func(t *testing.T) {
		ctx, s, _ := fixture("Org1MSP")
		_, err := new(Contract).RegisterEvidence(ctx, "bad", validHash, schema)
		requireErr(t, err, "INVALID_EVIDENCE")
		if s.reads != 0 || s.writes != 0 {
			t.Fatal("invalid input touched state")
		}
	})
	for _, org := range []string{"Org2MSP", "", "OtherMSP"} {
		t.Run("deny-"+org, func(t *testing.T) {
			ctx, s, _ := fixture(org)
			_, err := new(Contract).RegisterEvidence(ctx, validID, validHash, schema)
			requireErr(t, err, "PUBLISHER_NOT_ALLOWED")
			if s.reads+s.writes != 0 {
				t.Fatal("unauthorized access touched state")
			}
		})
	}
	t.Run("identity-error", func(t *testing.T) {
		ctx, _, i := fixture("Org1MSP")
		i.err = errors.New("identity error")
		_, err := new(Contract).RegisterEvidence(ctx, validID, validHash, schema)
		requireErr(t, err, "PUBLISHER_NOT_ALLOWED")
	})
	t.Run("read-error", func(t *testing.T) {
		ctx, s, _ := fixture("Org1MSP")
		s.getErr = errors.New("read failed")
		_, err := new(Contract).RegisterEvidence(ctx, validID, validHash, schema)
		requireErr(t, err, "read failed")
		if s.writes != 0 {
			t.Fatal("write after failed read")
		}
	})
	t.Run("write-error", func(t *testing.T) {
		ctx, s, _ := fixture("Org1MSP")
		s.putErr = errors.New("write failed")
		a, err := new(Contract).RegisterEvidence(ctx, validID, validHash, schema)
		requireErr(t, err, "write failed")
		if a != nil || len(s.data) != 0 {
			t.Fatal("false success")
		}
	})
	t.Run("idempotent-preserves-original-tx", func(t *testing.T) {
		ctx, s, _ := fixture("Org1MSP")
		original := Anchor{validID, validHash, schema, "original-tx"}
		s.data["event:"+validID], _ = json.Marshal(original)
		a, err := new(Contract).RegisterEvidence(ctx, validID, validHash, schema)
		if err != nil || *a != original || s.writes != 0 {
			t.Fatalf("not idempotent: %+v %v", a, err)
		}
	})
	for _, field := range []string{"hash", "schema"} {
		t.Run("conflict-"+field, func(t *testing.T) {
			ctx, s, _ := fixture("Org1MSP")
			a := Anchor{validID, validHash, schema, "old"}
			if field == "hash" {
				a.RecordHash = strings.Repeat("b", 64)
			} else {
				a.Schema = "older"
			}
			s.data["event:"+validID], _ = json.Marshal(a)
			_, err := new(Contract).RegisterEvidence(ctx, validID, validHash, schema)
			requireErr(t, err, "EVIDENCE_CONFLICT")
			if s.writes != 0 {
				t.Fatal("conflict overwrote state")
			}
		})
	}
	t.Run("corrupt-existing-json", func(t *testing.T) {
		ctx, s, _ := fixture("Org1MSP")
		s.data["event:"+validID] = []byte("{")
		_, err := new(Contract).RegisterEvidence(ctx, validID, validHash, schema)
		if err == nil || s.writes != 0 {
			t.Fatal("corrupt state accepted")
		}
	})
}
func TestGetEvidence(t *testing.T) {
	t.Run("existing", func(t *testing.T) {
		ctx, s, _ := fixture("Org2MSP")
		expected := Anchor{validID, validHash, schema, "old-tx"}
		s.data["event:"+validID], _ = json.Marshal(expected)
		a, err := new(Contract).GetEvidence(ctx, validID)
		if err != nil || a == nil || *a != expected || s.writes != 0 {
			t.Fatalf("bad read: %+v %v", a, err)
		}
	})
	t.Run("absent", func(t *testing.T) {
		ctx, _, _ := fixture("Org2MSP")
		a, err := new(Contract).GetEvidence(ctx, validID)
		if a != nil || err != nil {
			t.Fatal("absent should return nil")
		}
	})
	t.Run("invalid-id", func(t *testing.T) {
		ctx, s, _ := fixture("Org2MSP")
		_, err := new(Contract).GetEvidence(ctx, "../bad")
		requireErr(t, err, "INVALID_ID")
		if s.reads != 0 {
			t.Fatal("invalid id read state")
		}
	})
	t.Run("read-error", func(t *testing.T) {
		ctx, s, _ := fixture("Org2MSP")
		s.getErr = errors.New("read failed")
		_, err := new(Contract).GetEvidence(ctx, validID)
		requireErr(t, err, "read failed")
	})
	t.Run("corrupt-json", func(t *testing.T) {
		ctx, s, _ := fixture("Org2MSP")
		s.data["event:"+validID] = []byte("not-json")
		_, err := new(Contract).GetEvidence(ctx, validID)
		if err == nil {
			t.Fatal("corrupt state accepted")
		}
	})
}

// Fuzz the public contract with arbitrary strings. No real Fabric network is used.
// Invariant: errors must not write, and successful replay must not write again.
func FuzzRegisterEvidence(f *testing.F) {
	f.Add(validID, validHash, schema, "Org1MSP")
	f.Add("../bad", "bad", "unknown", "Org2MSP")
	f.Add(validID, validHash, schema, "Org2MSP")
	f.Fuzz(func(t *testing.T, id, hash, scheme, org string) {
		if len(id)+len(hash)+len(scheme)+len(org) > 4096 {
			t.Skip()
		}
		ctx, s, _ := fixture(org)
		contract := new(Contract)
		a, err := contract.RegisterEvidence(ctx, id, hash, scheme)
		if err != nil {
			if s.writes != 0 || a != nil {
				t.Fatal("failed request wrote or returned success")
			}
			return
		}
		if org != "Org1MSP" || a.EventID != id || a.RecordHash != hash || a.Schema != scheme || s.writes != 1 {
			t.Fatal("unexpected successful registration")
		}
		again, err := contract.RegisterEvidence(ctx, id, hash, scheme)
		if err != nil || *again != *a || s.writes != 1 {
			t.Fatal("replay not idempotent")
		}
		found, err := contract.GetEvidence(ctx, id)
		if err != nil || found == nil || *found != *a {
			t.Fatal("round trip failed")
		}
	})
}
