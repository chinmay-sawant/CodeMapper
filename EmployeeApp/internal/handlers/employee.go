package handlers

import (
	"employeeapp/internal/models"
	"net/http"

	"github.com/gin-gonic/gin"
)

type EmployeeHandler struct{}

func NewEmployeeHandler() *EmployeeHandler {
	return &EmployeeHandler{}
}

func (h *EmployeeHandler) GetEmployees(c *gin.Context) {
	// Mock data - in real app this would come from database
	employees := []models.Employee{
		{ID: 1, Name: "John Doe", Email: "john@example.com", Position: "Software Engineer", Salary: 80000},
		{ID: 2, Name: "Jane Smith", Email: "jane@example.com", Position: "Product Manager", Salary: 90000},
		{ID: 3, Name: "Bob Johnson", Email: "bob@example.com", Position: "DevOps Engineer", Salary: 85000},
	}

	c.JSON(http.StatusOK, gin.H{
		"data":    employees,
		"message": "Employees retrieved successfully",
	})
}
