package main

import (
 "encoding/json"
 "fmt"
 "regexp"
 "github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

type Contract struct { contractapi.Contract }
type Anchor struct { EventID string `json:"eventId"`; RecordHash string `json:"recordHash"`; Schema string `json:"schema"`; TxID string `json:"txId"` }
var eventPattern=regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)
var hashPattern=regexp.MustCompile(`^[a-f0-9]{64}$`)
func validate(id,hash,schema string) error {
 if !eventPattern.MatchString(id)||!hashPattern.MatchString(hash)||schema!="MAH-AFJ-CANON-1" { return fmt.Errorf("INVALID_EVIDENCE") };return nil
}
func(c *Contract) RegisterEvidence(ctx contractapi.TransactionContextInterface,id,hash,schema string)(*Anchor,error){
 if err:=validate(id,hash,schema);err!=nil{return nil,err}
 org,err:=ctx.GetClientIdentity().GetMSPID();if err!=nil||org!="Org1MSP" {return nil,fmt.Errorf("PUBLISHER_NOT_ALLOWED")}
 b,err:=ctx.GetStub().GetState("event:"+id);if err!=nil{return nil,err}
 if b!=nil {var a Anchor;if err=json.Unmarshal(b,&a);err!=nil{return nil,err};if a.RecordHash!=hash||a.Schema!=schema{return nil,fmt.Errorf("EVIDENCE_CONFLICT")};return &a,nil}
 a:=&Anchor{id,hash,schema,ctx.GetStub().GetTxID()};b,err=json.Marshal(a);if err!=nil{return nil,err};if err=ctx.GetStub().PutState("event:"+id,b);err!=nil{return nil,err};return a,nil
}
func(c *Contract) GetEvidence(ctx contractapi.TransactionContextInterface,id string)(*Anchor,error){
 if !eventPattern.MatchString(id){return nil,fmt.Errorf("INVALID_ID")};b,err:=ctx.GetStub().GetState("event:"+id);if err!=nil{return nil,err};if b==nil{return nil,nil};var a Anchor;if err=json.Unmarshal(b,&a);err!=nil{return nil,err};return &a,nil
}
func main(){cc,err:=contractapi.NewChaincode(&Contract{});if err!=nil{panic(err)};if err=cc.Start();err!=nil{panic(err)}}
